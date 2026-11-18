export const total = (lines) => lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
