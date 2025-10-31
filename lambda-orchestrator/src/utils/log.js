function logInfo(obj)  { console.log(JSON.stringify({ level: 'INFO',  ...obj })); }
function logError(obj) { console.error(JSON.stringify({ level: 'ERROR', ...obj })); }

module.exports = { logInfo, logError };
