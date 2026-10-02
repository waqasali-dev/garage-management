import pool from './db.js';

async function runTests() {
    console.log("🧪 Starting Automated Verification for Workshop Working Hours & Breaks...\n");
    let passed = 0;
    let failed = 0;

    const assert = (condition, title, details = "") => {
        if (condition) {
            console.log(`  ✅ PASS: ${title}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${title} ${details ? `(${details})` : ''}`);
            failed++;
        }
    };

    try {
        // -------------------------------------------------------------
        // TEST 1: GET /api/settings returns populated working_hours
        // -------------------------------------------------------------
        const sRes = await fetch('http://localhost:5000/api/settings');
        const sJson = await sRes.json();
        assert(sJson.success === true, "GET /api/settings returns 200 OK");
        assert(Array.isArray(sJson.data.working_hours?.shifts), "working_hours.shifts is an array");
        assert(sJson.data.working_hours.shifts.length === 2, "Default 2 shifts exist (8am-1pm & 4pm-8pm)");
        assert(sJson.data.working_hours.shifts[0].start === '08:00' && sJson.data.working_hours.shifts[0].end === '13:00', "Shift 1 is 08:00 - 13:00");
        assert(sJson.data.working_hours.shifts[1].start === '16:00' && sJson.data.working_hours.shifts[1].end === '20:00', "Shift 2 is 16:00 - 20:00");

        // -------------------------------------------------------------
        // TEST 2: GET /api/bays/B1/available-slots calculates shifts and excludes break
        // -------------------------------------------------------------
        const slotRes = await fetch('http://localhost:5000/api/bays/B1/available-slots?date=2026-10-05');
        const slotJson = await slotRes.json();
        assert(slotJson.success === true, "GET /api/bays/B1/available-slots returns success");
        assert(slotJson.isOpen === true, "Monday 2026-10-05 is open");
        assert(Array.isArray(slotJson.breaks) && slotJson.breaks.length === 1, "Break between 13:00 and 16:00 is detected");
        assert(slotJson.breaks[0].start === '13:00' && slotJson.breaks[0].end === '16:00', "Break interval is exactly 13:00 - 16:00 (3 hours)");

        const slots = slotJson.slots.map(s => s.time_label);
        const hasBreakSlot = slots.some(label => {
            const [st, en] = label.split(' - ');
            return (st >= '13:00' && st < '16:00') || (en > '13:00' && en <= '16:00');
        });
        assert(!hasBreakSlot, "No slot is generated between 13:00 and 16:00 (Break is strictly protected)");
        assert(slots.includes('08:00 - 09:00'), "Morning slot 08:00 - 09:00 is present");
        assert(slots.includes('12:00 - 13:00'), "Morning slot 12:00 - 13:00 is present");
        assert(slots.includes('16:00 - 17:00'), "Evening slot 16:00 - 17:00 is present");
        assert(slots.includes('19:00 - 20:00'), "Evening slot 19:00 - 20:00 is present");

        // -------------------------------------------------------------
        // TEST 3: Attempting to book an appointment during workshop break returns 400
        // -------------------------------------------------------------
        // Get an active vehicle
        const vRes = await pool.query("SELECT vehicle_id, owner_id FROM vehicles LIMIT 1;");
        const testVeh = vRes.rows[0];

        const breakBookRes = await fetch('http://localhost:5000/api/appointments/customer-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vehicle_id: testVeh.vehicle_id,
                owner_id: testVeh.owner_id,
                bay_id: 'B1',
                appointment_date: '2026-10-05',
                start_time: '14:00',
                end_time: '15:00',
                service_type: 'Oil Change During Break',
            }),
        });
        const breakBookJson = await breakBookRes.json();
        assert(breakBookRes.status === 400, "Booking inside workshop break (14:00 - 15:00) is rejected with 400 Bad Request");
        assert(breakBookJson.code === "OUTSIDE_WORKING_HOURS", "Rejection error code is OUTSIDE_WORKING_HOURS");

        // -------------------------------------------------------------
        // TEST 4: Attempting to book outside operating hours (e.g. 22:00) returns 400
        // -------------------------------------------------------------
        const nightBookRes = await fetch('http://localhost:5000/api/appointments/customer-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vehicle_id: testVeh.vehicle_id,
                owner_id: testVeh.owner_id,
                bay_id: 'B1',
                appointment_date: '2026-10-05',
                start_time: '22:00',
                end_time: '23:00',
            }),
        });
        assert(nightBookRes.status === 400, "Booking late at night (22:00 - 23:00) is rejected with 400 Bad Request");

        // -------------------------------------------------------------
        // TEST 5: Booking during an open shift (16:00 - 17:00) succeeds
        // -------------------------------------------------------------
        const validBookRes = await fetch('http://localhost:5000/api/appointments/customer-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vehicle_id: testVeh.vehicle_id,
                owner_id: testVeh.owner_id,
                bay_id: 'B1',
                appointment_date: '2026-10-05',
                start_time: '16:00',
                end_time: '17:00',
                service_type: 'Valid Evening Appointment',
            }),
        });
        const validBookJson = await validBookRes.json();
        assert(validBookRes.status === 201, "Booking during active shift (16:00 - 17:00) succeeds with 201 Created");
        assert(validBookJson.data?.appointment_id !== undefined, "Appointment ID returned");

        // Clean up test appointment
        if (validBookJson.data?.appointment_id) {
            await pool.query("DELETE FROM appointments WHERE appointment_id = $1;", [validBookJson.data.appointment_id]);
            if (validBookJson.data.work_order_id) {
                await pool.query("DELETE FROM work_order_data WHERE work_order_id = $1;", [validBookJson.data.work_order_id]);
            }
        }

        // -------------------------------------------------------------
        // TEST 6: Sunday is closed in standard schedule
        // -------------------------------------------------------------
        // 2026-10-04 is a Sunday
        const sunRes = await fetch('http://localhost:5000/api/bays/B1/available-slots?date=2026-10-04');
        const sunJson = await sunRes.json();
        assert(sunJson.isOpen === false, "Sunday 2026-10-04 is marked as closed");
        assert(sunJson.slots.length === 0, "Sunday generates 0 slots");

        console.log(`\n========================================`);
        console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log(`========================================\n`);

    } catch (err) {
        console.error("Test execution error:", err);
    } finally {
        await pool.end();
        process.exit(failed > 0 ? 1 : 0);
    }
}

runTests();
