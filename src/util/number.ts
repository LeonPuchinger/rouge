export function between(
    number: number,
    minConstraint: number,
    maxConstraint: number,
): boolean {
    return number >= minConstraint && number <= maxConstraint;
}
