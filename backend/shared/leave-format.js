export function formatLeaveHours(hours) {
    const rounded = Math.round(hours * 100) / 100;
    return `${formatHours(rounded)} hodín`;
}
function formatHours(hours) {
    return Number.isInteger(hours) ? `${hours}` : hours.toFixed(2);
}
//# sourceMappingURL=leave-format.js.map