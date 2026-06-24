const config = { startDate: "2026-06-27", numDays: 7 };
console.log(process.env.TZ, Array.from({ length: config.numDays }).map((_, i) => { const d = new Date(config.startDate); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0]; }));
