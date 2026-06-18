/** Returns true when `id` is a 24-character hex string (MongoDB ObjectId format). */
export const isValidObjectIdString = (id: string): boolean => /^[a-f\d]{24}$/i.test(id);
