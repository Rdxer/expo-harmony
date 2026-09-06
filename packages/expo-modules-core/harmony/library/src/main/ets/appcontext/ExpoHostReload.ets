import { ExpoModuleError } from '../modules/ExpoModuleError';

type ExpoHostReloadCallback = (reason: string) => Promise<void>;

/** Routes a reload to the UI owner of exactly one RNInstance. */
export class ExpoHostReload {
  private static readonly routes: Map<number, ExpoHostReloadCallback> = new Map<number, ExpoHostReloadCallback>();

  /** Register from the Host's onSetUp hook; dispose when that UI owner unmounts. */
  static register(instanceId: number, reload: ExpoHostReloadCallback): () => void {
    if (ExpoHostReload.routes.has(instanceId)) {
      throw new ExpoModuleError('ERR_RELOAD_HOST_CONFLICT', `RNInstance ${instanceId} already has a reload owner.`);
    }
    ExpoHostReload.routes.set(instanceId, reload);
    return (): void => {
      if (ExpoHostReload.routes.get(instanceId) === reload) ExpoHostReload.routes.delete(instanceId);
    };
  }

  /** Resolve before destructive module preparation starts. */
  static require(instanceId: number): ExpoHostReloadCallback {
    const reload = ExpoHostReload.routes.get(instanceId);
    if (reload === undefined) {
      throw new ExpoModuleError(
        'ERR_RELOAD_UNAVAILABLE',
        `RNInstance ${instanceId} requires ExpoRNApp to reload. Externally managed instances also require an explicit replacement callback.`,
      );
    }
    return reload;
  }
}
