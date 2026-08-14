package uk.co.club.booking.domain.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.HttpClient;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * Managing accounts and roles, through the API an admin actually uses.
 *
 * <p>The rules under test are the ones that stop the club locking itself out. They are worth
 * an integration test rather than a unit test because the failure they prevent is a state of
 * the database — "no account can reach the settings screen" — and only a real round trip
 * proves the guard survives the transaction that would have caused it.
 */
@AutoConfigureTestRestTemplate
class AdminUserManagementIT extends AbstractIntegrationTest {

    private static final String ADMIN_PASSWORD = "AdminPass123!";
    private static final String STAFF_PASSWORD = "StaffPass123!";
    private static final String NEW_PASSWORD = "BrandNewPass123!";

    @Autowired private TestRestTemplate rest;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private UserRepository userRepository;
    @Autowired private AdminUserService adminUserService;

    private long adminId;
    private long staffId;

    @BeforeEach
    void seedPeople() {
        adminId = fixtures.anAdmin("users-admin@test.local", ADMIN_PASSWORD);
        staffId = fixtures.aUser("users-staff@test.local", STAFF_PASSWORD, "STAFF");
        fixtures.aCustomer("users-customer@test.local", "CustomerPass123!");
    }

    private HttpClient admin() {
        return HttpClient.anonymous(rest).login("users-admin@test.local", ADMIN_PASSWORD);
    }

    @Test
    @DisplayName("an admin creates a staff account that can immediately sign in")
    void createsAStaffAccount() {
        // The whole point of the screen: someone starts on Monday and needs to work the
        // counter. Asserting the login, not just the 201 — an account that is created but
        // cannot sign in has not been created in any sense the club cares about.
        ResponseEntity<Map> created = admin().exchange(
                HttpMethod.POST,
                "/api/admin/users",
                Map.of(
                        "email", "new-hire@test.local",
                        "password", NEW_PASSWORD,
                        "firstName", "New",
                        "lastName", "Hire",
                        "role", "STAFF"),
                Map.class);

        assertThat(created.getStatusCode().value()).isEqualTo(201);
        assertThat(created.getBody()).containsEntry("role", "STAFF");
        // The response must never carry the hash. A record built by hand rather than the
        // entity is what prevents it, so this asserts the property rather than trusting it.
        assertThat(created.getBody()).doesNotContainKeys("passwordHash", "password");

        HttpClient newHire =
                HttpClient.anonymous(rest).login("new-hire@test.local", NEW_PASSWORD);
        assertThat(newHire.statusOf(HttpMethod.GET, "/api/admin/dashboard", null))
                .as("a newly created staff account reaches the day job")
                .isEqualTo(200);
        assertThat(newHire.statusOf(HttpMethod.GET, "/api/admin/settings/club", null))
                .as("but not the club's configuration")
                .isEqualTo(403);
    }

    @Test
    @DisplayName("promoting a customer to staff grants access without a new account")
    void promotesAnExistingAccount() {
        // Staff are usually already customers. Promoting keeps their booking history on one
        // account instead of stranding it on an orphan.
        long customerId = userRepository.findByEmail("users-customer@test.local").orElseThrow().getId();

        int status = admin().statusOf(
                HttpMethod.PUT, "/api/admin/users/" + customerId + "/role", Map.of("role", "STAFF"));

        assertThat(status).isEqualTo(200);
        HttpClient promoted =
                HttpClient.anonymous(rest).login("users-customer@test.local", "CustomerPass123!");
        assertThat(promoted.statusOf(HttpMethod.GET, "/api/admin/bookings", null)).isEqualTo(200);
    }

    @Test
    @DisplayName("demoting a staff member revokes their access immediately")
    void demotionRevokesAccess() {
        // The more important direction. This is how access is taken away when someone leaves,
        // and it must not require deactivating the account and destroying their own history.
        int status = admin().statusOf(
                HttpMethod.PUT, "/api/admin/users/" + staffId + "/role", Map.of("role", "CUSTOMER"));
        assertThat(status).isEqualTo(200);

        HttpClient demoted =
                HttpClient.anonymous(rest).login("users-staff@test.local", STAFF_PASSWORD);
        assertThat(demoted.statusOf(HttpMethod.GET, "/api/admin/bookings", null))
                .as("a demoted staff member is refused the admin area")
                .isEqualTo(403);
    }

    @Test
    @DisplayName("an admin cannot remove their own admin access, even when others remain")
    void cannotDemoteSelf() {
        // A SECOND admin exists throughout, deliberately. With only one, "refused because you
        // are yourself" and "refused because you are the last admin" are the same situation,
        // and deleting either guard leaves this test green. The second admin makes the
        // last-admin rule inapplicable, so only the self rule can produce the refusal.
        fixtures.anAdmin("spare-admin@test.local", ADMIN_PASSWORD);

        int status = admin().statusOf(
                HttpMethod.PUT, "/api/admin/users/" + adminId + "/role", Map.of("role", "STAFF"));

        assertThat(status).isEqualTo(422);
        assertThat(userRepository.findById(adminId).orElseThrow().getRole()).isEqualTo(Role.ADMIN);
    }

    @Test
    @DisplayName("an admin cannot deactivate their own account, even when others remain")
    void cannotDeactivateSelf() {
        // Same separation as above, for the deactivation path.
        fixtures.anAdmin("spare-admin@test.local", ADMIN_PASSWORD);

        assertThat(admin().statusOf(
                        HttpMethod.PUT, "/api/admin/users/" + adminId + "/active?active=false", null))
                .isEqualTo(422);
        assertThat(userRepository.findById(adminId).orElseThrow().isActive()).isTrue();
    }

    @Test
    @DisplayName("the club's last admin cannot be demoted, even by a colleague")
    void demotingTheLastAdminIsRefused() {
        // Isolating the last-admin rule from the self rule requires acting != target while
        // the target is the only admin — a state that is awkward to reach over HTTP, because
        // reaching it demotes the only other admin who could then do the acting.
        //
        // Called directly on the service for that reason. The HTTP tests above already prove
        // the endpoint is wired to this method and that the acting id comes from the session;
        // what is under test here is the rule itself.
        long soleAdminId = adminId;
        assertThat(userRepository.countByRoleAndActiveTrueAndIdNot(Role.ADMIN, soleAdminId))
                .as("precondition: this really is the club's only admin")
                .isZero();

        // A different admin id as the actor, so the self rule cannot be what refuses this.
        long someoneElse = staffId;
        assertThatThrownBy(
                        () -> adminUserService.changeRole(soleAdminId, Role.STAFF, someoneElse))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("only admin");

        assertThatThrownBy(() -> adminUserService.setActive(soleAdminId, false, someoneElse))
                .as("the same rule guards deactivation, which locks the club out just as hard")
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("only admin");

        // And the guard counts rather than refusing every change: with a second admin present
        // the same call succeeds.
        fixtures.anAdmin("second-admin@test.local", ADMIN_PASSWORD);
        adminUserService.changeRole(soleAdminId, Role.STAFF, someoneElse);
        assertThat(userRepository.findById(soleAdminId).orElseThrow().getRole())
                .isEqualTo(Role.STAFF);
    }

    @Test
    @DisplayName("a deactivated account cannot sign in")
    void deactivationBlocksLogin() {
        assertThat(admin().statusOf(
                        HttpMethod.PUT, "/api/admin/users/" + staffId + "/active?active=false", null))
                .isEqualTo(200);

        // 401, because Spring Security refuses a disabled account at authentication rather
        // than the application checking after the fact.
        ResponseEntity<String> login = rest.postForEntity(
                "/api/auth/login",
                Map.of("email", "users-staff@test.local", "password", STAFF_PASSWORD),
                String.class);
        assertThat(login.getStatusCode().value()).isNotEqualTo(200);
    }

    @Test
    @DisplayName("an admin can set a new password for someone who has lost theirs")
    void resetsAnotherAccountsPassword() {
        assertThat(admin().statusOf(
                        HttpMethod.PUT,
                        "/api/admin/users/" + staffId + "/password",
                        Map.of("password", NEW_PASSWORD)))
                .isEqualTo(204);

        assertThat(HttpClient.anonymous(rest)
                        .login("users-staff@test.local", NEW_PASSWORD)
                        .statusOf(HttpMethod.GET, "/api/admin/dashboard", null))
                .as("the new password works")
                .isEqualTo(200);
    }

    @Test
    @DisplayName("a wildcard in the search box does not match every account")
    void searchEscapesLikeWildcards() {
        // Without escaping, "%" is a LIKE wildcard and the directory ignores what was typed —
        // the admin sees everyone and believes they searched.
        ResponseEntity<Map> response =
                admin().exchange(HttpMethod.GET, "/api/admin/users?search=%25", null, Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(((Number) response.getBody().get("totalItems")).longValue())
                .as("a literal percent matches no email or name here")
                .isZero();
    }

    @Test
    @DisplayName("the directory can be filtered to just the people who work here")
    void filtersByRole() {
        ResponseEntity<Map> response =
                admin().exchange(HttpMethod.GET, "/api/admin/users?role=STAFF", null, Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(((Number) response.getBody().get("totalItems")).longValue()).isEqualTo(1);
    }
}
