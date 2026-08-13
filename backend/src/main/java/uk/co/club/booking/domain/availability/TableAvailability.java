package uk.co.club.booking.domain.availability;

import java.util.List;
import uk.co.club.booking.domain.table.TableType;

/**
 * One row of the availability grid.
 *
 * @param hourlyRatePence the <em>lowest</em> hourly rate anywhere in this row — a "from"
 *     price. It used to be the rate at opening time, which was silently wrong for any rule
 *     narrowed by time of day: a morning rate showed against the whole day, and an evening
 *     rate never showed at all. A single number cannot describe a row whose price changes
 *     during the day, so it describes the cheapest rather than pretending to be uniform.
 * @param varyingRate whether the rate changes across the row, so the client can render
 *     "from £7.50/hr" rather than "£7.50/hr" and not misquote the evening
 * @param highestHourlyRatePence the dearest rate in the row, for showing a range
 */
public record TableAvailability(
        long tableId,
        String tableName,
        TableType tableType,
        boolean tableActive,
        int hourlyRatePence,
        boolean varyingRate,
        int highestHourlyRatePence,
        List<SlotView> slots) {}
