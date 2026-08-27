// ============================================================
// GET /api/calendar.ics
// A subscribable calendar feed (RFC 5545) with one all-day event per
// day: that day's split (Push/Pull/Legs/Repos, read from Fitness's
// actual rotation) and the matching kcal target (same Mifflin-St Jeor +
// rest-day-tier-drop formula as Alimentation/Calendrier).
//
// Reconstructed server-side straight from the same Supabase app_state
// rows the app itself syncs to (po-coach / health / nutrition) — no
// separate data entry, this mirrors whatever's actually in Fitness.
// Add this URL as a "subscribed calendar" in Google/Apple Calendar; the
// calendar app controls its own refresh cadence (commonly every few
// hours to once a day), this endpoint doesn't push anything.
// ============================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://srajryooffirbroltjmg.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_5142ZwTLF_DkSVRzciNuRA_bHwRAu4c';

  async function fetchAppState(key) {
    const url = SUPABASE_URL + '/rest/v1/app_state?key=eq.' + encodeURIComponent(key) + '&select=data';
    try {
      const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
      if (!r.ok) return null;
      const rows = await r.json();
      return (rows && rows[0] && rows[0].data) || null;
    } catch (e) { return null; }
  }

  let coach, health, nutrition;
  try {
    [coach, health, nutrition] = await Promise.all([
      fetchAppState('po-coach'),
      fetchAppState('health'),
      fetchAppState('nutrition'),
    ]);
  } catch (e) {
    return res.status(500).send('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR');
  }

  const gym = (coach && coach.po_coach_v1) || {};
  const weights = (coach && coach.po_coach_weights) || [];
  const overrides = (coach && coach.po_day_overrides_v1) || {};
  const profile = (health && health.po_water_v1 && health.po_water_v1.profile) ||
    { weightKg: 75, age: 25, sex: 'm', activityHrsPerWeek: 5, heightCm: 175 };
  const program = (nutrition && nutrition.po_nutrition_program_v1) || { deficitPct: 20 };

  function liveWeightKg() {
    if (!weights.length) return null;
    const unit = gym.units || 'kg';
    const latest = weights[weights.length - 1];
    return unit === 'lb' ? latest.weight / 2.20462 : latest.weight;
  }
  const isRest = (label) => /repos|rest/i.test(label || '');
  function computeBMR(weightKg) {
    const s = profile.sex === 'f' ? -161 : (profile.sex === 'm' ? 5 : -78);
    return 10 * weightKg + 6.25 * (profile.heightCm || 175) - 5 * (profile.age || 25) + s;
  }
  function activityMultiplier(h) {
    h = h || 0;
    if (h < 2) return 1.2; if (h < 4) return 1.375; if (h < 7) return 1.55; if (h < 10) return 1.725; return 1.9;
  }
  function tdee(weightKg, restDay) {
    const tiers = [1.2, 1.375, 1.55, 1.725, 1.9];
    let mult = activityMultiplier(profile.activityHrsPerWeek);
    if (restDay) { const idx = Math.max(0, tiers.indexOf(mult) - 1); mult = tiers[idx]; }
    return computeBMR(weightKg) * mult;
  }
  const weightKg = liveWeightKg() || profile.weightKg || 75;
  const deficitPct = typeof program.deficitPct === 'number' ? program.deficitPct : 20;
  const kcalTrain = Math.round(tdee(weightKg, false) * (1 - deficitPct / 100));
  const kcalRest = Math.round(tdee(weightKg, true) * (1 - deficitPct / 100));

  const icsDate = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const dateKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const escapeText = (s) => String(s).replace(/[\\,;]/g, (c) => '\\' + c);

  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tableau de bord//Calendrier//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Séance & Calories',
    'X-WR-TIMEZONE:Europe/Paris',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  // Only days you actually placed in Calendrier get an event — nothing is
  // guessed from the Fitness rotation formula and pushed to your phone
  // without you choosing it first.
  for (let i = -3; i <= 60; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const split = overrides[dateKey(d)];
    if (!split) continue;
    const rest = isRest(split);
    const kcal = rest ? kcalRest : kcalTrain;
    const summary = (rest ? '😴 Repos' : '💪 ' + split) + ' · ~' + kcal + ' kcal';
    const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    lines.push('BEGIN:VEVENT');
    lines.push('UID:dash-cal-' + icsDate(d) + '@tableau-de-bord');
    lines.push('DTSTAMP:' + icsDate(now) + 'T000000Z');
    lines.push('DTSTART;VALUE=DATE:' + icsDate(d));
    lines.push('DTEND;VALUE=DATE:' + icsDate(dEnd));
    lines.push('SUMMARY:' + escapeText(summary));
    lines.push('DESCRIPTION:' + escapeText(rest ? 'Jour de repos — vise ~' + kcal + ' kcal.' : split + ' — vise ~' + kcal + ' kcal.'));
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  res.status(200).send(lines.join('\r\n'));
}
