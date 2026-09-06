import { RNInstance, RNInstanceImpl } from '@rnoh/react-native-openharmony/ts';

/**
 * RNOH 0.84 removes the native message route before calling TurboModule
 * __onDestroy__. Keep its instance alive until Expo's asynchronous teardown
 * completes. This per-instance adapter can go once RNOH exposes an awaited
 * pre-destroy hook; both normal destruction and reload use onDestroy.
 */
export function installRnohDestroyBarrier(instance: RNInstance, beforeDestroy: () => Promise<void>): void {
  if (!(instance instanceof RNInstanceImpl)) {
    throw new Error('Expo Modules requires an RNInstanceImpl destruction barrier.');
  }

  const onDestroy = instance.onDestroy.bind(instance);
  let destruction: Promise<void> | undefined;

  instance.onDestroy = (shouldTryDisconnectingDebugger: boolean = true): Promise<void> => {
    if (destruction === undefined) {
      // Assign the promise before entering Expo, including reentrant cleanup.
      destruction = Promise.resolve()
        .then(beforeDestroy)
        .then(() => onDestroy(shouldTryDisconnectingDebugger));
    }
    return destruction;
  };
}
