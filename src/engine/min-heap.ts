interface Entry<T> {
  value: T
  priority: number
  sequence: number
}

function precedes<T>(a: Entry<T>, b: Entry<T>): boolean {
  return a.priority < b.priority || (a.priority === b.priority && a.sequence < b.sequence)
}

/** A stable binary min-heap. Equal priorities leave in insertion order. */
export class MinHeap<T> {
  private readonly entries: Entry<T>[] = []
  private sequence = 0

  get size(): number {
    return this.entries.length
  }

  push(value: T, priority: number): void {
    if (!Number.isFinite(priority)) throw new RangeError('Priority must be finite.')
    const entry = { value, priority, sequence: this.sequence++ }
    let index = this.entries.length
    this.entries.push(entry)
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (!precedes(entry, this.entries[parent]!)) break
      this.entries[index] = this.entries[parent]!
      index = parent
    }
    this.entries[index] = entry
  }

  pop(): T | undefined {
    const first = this.entries[0]
    const tail = this.entries.pop()
    if (!tail || !this.entries.length) return first?.value
    let index = 0
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1
      const right = child + 1
      if (right < this.entries.length && precedes(this.entries[right]!, this.entries[child]!))
        child = right
      if (!precedes(this.entries[child]!, tail)) break
      this.entries[index] = this.entries[child]!
      index = child
    }
    this.entries[index] = tail
    return first!.value
  }
}
