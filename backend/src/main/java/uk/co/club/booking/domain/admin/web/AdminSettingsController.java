package uk.co.club.booking.domain.admin.web;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.admin.web.dto.SettingsRequests;
import uk.co.club.booking.domain.admin.web.dto.SettingsResponses;
import uk.co.club.booking.domain.admin.web.dto.SettingsUpdateResponse;
import uk.co.club.booking.domain.club.SettingsService;

/**
 * The settings that drive the booking engine.
 *
 * <p>These are the most consequential endpoints in the admin area: opening hours and booking
 * rules decide what every customer can buy, and a pricing rule decides what they are charged.
 * Authorisation is the blanket {@code /api/admin/**} rule, as everywhere else.
 *
 * <p>Each write returns the saved state <em>and</em> a warnings list. See
 * {@link SettingsUpdateResponse} for why the warnings exist rather than the change being
 * blocked.
 */
@RestController
@RequestMapping("/api/admin/settings")
public class AdminSettingsController {

    private final SettingsService settingsService;

    public AdminSettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    // ---------------------------------------------------------------- club details

    @GetMapping("/club")
    public SettingsResponses.ClubDetails club() {
        return SettingsResponses.ClubDetails.from(settingsService.club());
    }

    @PutMapping("/club")
    public SettingsUpdateResponse<SettingsResponses.ClubDetails> updateClub(
            @Valid @RequestBody SettingsRequests.ClubDetails request) {
        var saved = settingsService.updateClub(
                request.name(),
                request.addressLine1(),
                request.addressLine2(),
                request.city(),
                request.postcode(),
                request.phone(),
                request.email(),
                request.website(),
                request.description());
        // Contact details cannot invalidate a booking, so the warnings list is always empty
        // here. Returned anyway so every settings response has the same shape.
        return SettingsUpdateResponse.of(SettingsResponses.ClubDetails.from(saved), List.of());
    }

    // ---------------------------------------------------------------- opening hours

    @GetMapping("/opening-hours")
    public List<SettingsResponses.DayHours> openingHours() {
        return settingsService.openingHours().stream()
                .map(SettingsResponses.DayHours::from)
                .toList();
    }

    @PutMapping("/opening-hours")
    public SettingsUpdateResponse<List<SettingsResponses.DayHours>> updateOpeningHours(
            @Valid @RequestBody SettingsRequests.OpeningHoursUpdate request) {

        var warnings = settingsService.updateOpeningHours(
                request.days().stream()
                        .map(day -> new SettingsService.DayHoursInput(
                                day.day(), day.closed(), day.openTime(), day.closeTime()))
                        .toList());

        return SettingsUpdateResponse.of(openingHours(), warnings);
    }

    // ---------------------------------------------------------------- booking rules

    @GetMapping("/booking-rules")
    public SettingsResponses.BookingRules bookingRules() {
        return SettingsResponses.BookingRules.from(settingsService.bookingSettings());
    }

    @PutMapping("/booking-rules")
    public SettingsUpdateResponse<SettingsResponses.BookingRules> updateBookingRules(
            @Valid @RequestBody SettingsRequests.BookingRules request) {

        var warnings = settingsService.updateBookingSettings(
                request.minDurationMinutes(),
                request.maxDurationMinutes(),
                request.incrementMinutes(),
                request.minNoticeMinutes(),
                request.maxAdvanceDays(),
                request.cancellationNoticeHours(),
                request.paymentHoldMinutes());

        return SettingsUpdateResponse.of(bookingRules(), warnings);
    }

    // ---------------------------------------------------------------- pricing

    @GetMapping("/pricing-rules")
    public List<SettingsResponses.PricingRuleResponse> pricingRules() {
        return settingsService.pricingRules().stream()
                .map(SettingsResponses.PricingRuleResponse::from)
                .toList();
    }

    @PostMapping("/pricing-rules")
    @ResponseStatus(HttpStatus.CREATED)
    public SettingsResponses.PricingRuleResponse createPricingRule(
            @Valid @RequestBody SettingsRequests.PricingRuleInput request) {
        return SettingsResponses.PricingRuleResponse.from(save(null, request));
    }

    @PutMapping("/pricing-rules/{id}")
    public SettingsResponses.PricingRuleResponse updatePricingRule(
            @PathVariable long id, @Valid @RequestBody SettingsRequests.PricingRuleInput request) {
        return SettingsResponses.PricingRuleResponse.from(save(id, request));
    }

    @DeleteMapping("/pricing-rules/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePricingRule(@PathVariable long id) {
        settingsService.deletePricingRule(id);
    }

    private uk.co.club.booking.domain.club.PricingRule save(
            Long id, SettingsRequests.PricingRuleInput request) {
        return settingsService.savePricingRule(
                id,
                request.name(),
                request.tableType(),
                request.dayOfWeek(),
                request.startTime(),
                request.endTime(),
                request.hourlyRatePence(),
                request.priority(),
                request.active());
    }
}
