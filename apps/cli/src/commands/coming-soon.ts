/** Return the message shown for a not-yet-implemented command. */
export function comingSoonMessage(command: string): string {
  return `[atlas ${command}] Coming Soon`;
}

/** Print the "Coming Soon" placeholder for a command. */
export function printComingSoon(command: string): void {
  console.log(comingSoonMessage(command));
}
