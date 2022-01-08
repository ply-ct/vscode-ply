const date = new Date();
const hrs = String(date.getHours()).padStart(2, '0');
const mins = String(date.getMinutes()).padStart(2, '0');
const secs = String(date.getSeconds()).padStart(2, '0');
const millis = String(date.getMilliseconds()).padStart(3, '0');
console.info(`${hrs} ${mins} ${secs} ${millis} Page load`);
