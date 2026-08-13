package uk.co.club.booking.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * A browser-shaped HTTP client for the boundary tests.
 *
 * <p>Real HTTP rather than {@code MockMvc} or a direct service call, because the thing under
 * test <em>is</em> the filter chain: the role check, the CSRF filter and the session cookie all
 * live there. A test that called the controller method directly would pass with authorisation
 * entirely switched off, which is precisely the failure it exists to catch.
 *
 * <p>Keeps its own cookie jar so a session survives across calls, and echoes the XSRF-TOKEN
 * cookie back as a header on writes exactly as the SPA does. Without that, every write would
 * fail with 403 for the wrong reason and the test would prove nothing about roles.
 */
public class HttpClient {

    private final TestRestTemplate rest;
    private final List<String> cookies = new ArrayList<>();

    public HttpClient(TestRestTemplate rest) {
        this.rest = rest;
    }

    /** Anonymous by construction; call {@link #login} to become someone. */
    public static HttpClient anonymous(TestRestTemplate rest) {
        return new HttpClient(rest);
    }

    /** Signs in, keeping the session cookie for subsequent calls. */
    public HttpClient login(String email, String password) {
        // Primes the CSRF cookie: the login POST is itself a write and needs the token.
        get("/api/auth/me", String.class);
        ResponseEntity<String> response = exchange(
                HttpMethod.POST,
                "/api/auth/login",
                Map.of("email", email, "password", password),
                String.class);
        assertThat(response.getStatusCode().value())
                .as("login for %s", email)
                .isEqualTo(200);
        return this;
    }

    public <T> ResponseEntity<T> get(String path, Class<T> responseType) {
        return exchange(HttpMethod.GET, path, null, responseType);
    }

    public <T> ResponseEntity<T> post(String path, Object body, Class<T> responseType) {
        return exchange(HttpMethod.POST, path, body, responseType);
    }

    public <T> ResponseEntity<T> put(String path, Object body, Class<T> responseType) {
        return exchange(HttpMethod.PUT, path, body, responseType);
    }

    /** Status code alone, for the matrix. */
    public int statusOf(HttpMethod method, String path, Object body) {
        return exchange(method, path, body, String.class).getStatusCode().value();
    }

    public <T> ResponseEntity<T> exchange(
            HttpMethod method, String path, Object body, Class<T> responseType) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (!cookies.isEmpty()) {
            headers.put(HttpHeaders.COOKIE, List.of(String.join("; ", cookies)));
        }
        String csrf = cookieValue("XSRF-TOKEN");
        if (csrf != null && method != HttpMethod.GET) {
            headers.set("X-XSRF-TOKEN", csrf);
        }

        ResponseEntity<T> response =
                rest.exchange(path, method, new HttpEntity<>(body, headers), responseType);
        rememberCookies(response.getHeaders());
        return response;
    }

    private void rememberCookies(HttpHeaders headers) {
        List<String> setCookies = headers.get(HttpHeaders.SET_COOKIE);
        if (setCookies == null) {
            return;
        }
        for (String setCookie : setCookies) {
            String pair = setCookie.split(";", 2)[0];
            String name = pair.split("=", 2)[0];
            // A rotated session id (login) or a cleared cookie must replace the old value,
            // not sit alongside it — two SESSION cookies and the server picks the wrong one.
            cookies.removeIf(existing -> existing.startsWith(name + "="));
            if (!pair.endsWith("=")) {
                cookies.add(pair);
            }
        }
    }

    private String cookieValue(String name) {
        return cookies.stream()
                .filter(cookie -> cookie.startsWith(name + "="))
                .map(cookie -> cookie.substring(name.length() + 1))
                .findFirst()
                .orElse(null);
    }
}
