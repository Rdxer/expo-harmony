import { CommonOptions, parseArgs } from '../args';
import { HarmonyCliError } from '../errors';

const StartOptions = {
  ...CommonOptions,
  'clear': { short: 'c', type: 'boolean' },
  'port': { type: 'string' },
  'reset-cache': { type: 'boolean' },
} as const;

function parseStartArgs(argv: string[]) {
  const { positionals, values } = parseArgs(StartOptions, argv);

  if (positionals.length > 1) {
    throw new HarmonyCliError('ERR_HARMONY_CONFIG_INVALID', `Unexpected start positional argument: ${positionals[1]}`, {
      operation: 'parse-arguments',
    });
  }

  const port = values.port === undefined ? 8081 : Number(values.port);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new HarmonyCliError('ERR_HARMONY_CONFIG_INVALID', '--port must be an integer between 1 and 65535.', {
      operation: 'parse-arguments',
    });
  }

  return {
    help: Boolean(values.help),
    port,
    project: positionals[0],
    resetCache: Boolean(values['reset-cache'] || values.clear),
  };
}

export { parseStartArgs };
