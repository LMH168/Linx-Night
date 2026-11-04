/** 按项目现有流程，从最小存活号码开始递增。 */
export function speechOrder(_deaths: readonly number[], alive: readonly number[]): number[] {
  return [...new Set(alive)].sort((a, b) => a - b)
}
