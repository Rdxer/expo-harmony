/** Keep tool overrides consistent across CLI, workspace and local HAR builds. */
export function resolveHarmonyCommand(command: string, args: readonly string[], env = process.env) {
  const configured = command === 'ohpm'
    ? env.HARMONY_OHPM
    : command === 'hvigorw' ? env.HARMONY_HVIGORW : undefined;
  if (!configured) return { command, args: [...args] };

  const node = command === 'ohpm' ? env.HARMONY_OHPM_NODE : env.HARMONY_HVIGOR_NODE;
  return /\.(?:c|m)?js$/iu.test(configured)
    ? { command: node || env.HARMONY_NODE || process.execPath, args: [configured, ...args] }
    : { command: configured, args: [...args] };
}

export { terminateProcess } from './terminateProcess';
