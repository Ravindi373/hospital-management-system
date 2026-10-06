// Small date helpers. Dates travel as 'YYYY-MM-DD' strings and times as 'HH:MM'.
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const weekday = (date) => new Date(`${date}T00:00:00`).getDay();     // 0 = Sunday
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const addMinutes = (hhmm, mins) => {
  const [h, m] = hhmm.split(':').map(Number); const t = h * 60 + m + mins;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

module.exports = { pad, isoDate, today, nowTime, weekday, DAY_NAMES, addMinutes };
