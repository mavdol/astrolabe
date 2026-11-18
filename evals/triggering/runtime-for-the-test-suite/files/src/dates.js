export const dueDate = (issued, days) => new Date(issued.getTime() + days * 86400000);
