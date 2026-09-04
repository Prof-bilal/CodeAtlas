// Scheduled jobs

export class Scheduler {
  private intervals: NodeJS.Timeout[] = [];

  schedule(name: string, interval: number, handler: () => void) {
    const id = setInterval(handler, interval);
    this.intervals.push(id);
    console.log(Scheduled job:  every ms);
  }

  stopAll() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }
}
