/** `list` without `x` if it has it, or with `x` added if not. */
export const toggleIn = <T>(list: readonly T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
