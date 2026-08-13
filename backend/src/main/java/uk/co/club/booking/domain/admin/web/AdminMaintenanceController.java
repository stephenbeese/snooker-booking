package uk.co.club.booking.domain.admin.web;

import jakarta.validation.Valid;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.admin.web.dto.CreateMaintenanceBlockRequest;
import uk.co.club.booking.domain.admin.web.dto.MaintenanceBlockResponse;
import uk.co.club.booking.domain.table.MaintenanceBlockService;
import uk.co.club.booking.security.AppUserPrincipal;

/** Taking tables out of service. Authorisation is handled by the {@code /api/admin/**} rule. */
@RestController
@RequestMapping("/api/admin/maintenance-blocks")
public class AdminMaintenanceController {

    private final MaintenanceBlockService blockService;
    private final ClubClock clubClock;

    public AdminMaintenanceController(
            MaintenanceBlockService blockService, ClubClock clubClock) {
        this.blockService = blockService;
        this.clubClock = clubClock;
    }

    /**
     * Blocks overlapping a date range, club-local and inclusive of {@code to}.
     *
     * <p>The upper bound is the start of the following day, so a single-day query returns that
     * day's blocks rather than nothing.
     */
    @GetMapping
    public List<MaintenanceBlockResponse> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        Instant start = clubClock.toInstant(from, java.time.LocalTime.MIDNIGHT);
        Instant end = clubClock.toInstant(to.plusDays(1), java.time.LocalTime.MIDNIGHT);
        return blockService.findBetween(start, end).stream()
                .map(block -> MaintenanceBlockResponse.from(block, clubClock))
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MaintenanceBlockResponse create(
            @Valid @RequestBody CreateMaintenanceBlockRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {

        // Converted here, once, via ClubClock — the same single conversion point the booking
        // endpoint uses, so a block and a booking for "14:00" mean the same instant.
        Instant startAt = clubClock.toInstant(request.date(), request.startTime());
        Instant endAt = clubClock.toInstant(request.date(), request.endTime());

        return MaintenanceBlockResponse.from(
                blockService.create(
                        request.tableId(), startAt, endAt, request.reason(), principal.id()),
                clubClock);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        blockService.delete(id);
    }
}
