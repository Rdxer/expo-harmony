import { JSBundleProvider, RNApp, RNInstance } from '@rnoh/react-native-openharmony';
import type { RNInstanceConfig } from '@rnoh/react-native-openharmony/src/main/ets/RNApp';
import type { WrappedCustomRNComponentBuilder } from '@rnoh/react-native-openharmony/src/main/ets/RNOH';
import { ExpoHostReload } from './appcontext/ExpoHostReload';
import { ExpoModuleError } from './modules/ExpoModuleError';

interface ExpoUnmanagedRNInstanceConfig {
  rnInstance: RNInstance;
}

/** An unmanaged Host must destroy its old instance and return its replacement. */
type ExpoRNInstanceReplacement = (reason: string) => Promise<RNInstance>;

/** RNApp with a reload route scoped to this UI owner. RNOH still owns managed instances. */
@Component
export struct ExpoRNApp {
  @Require public rnInstanceConfig!: RNInstanceConfig;
  @Require public appKey: string = '';
  public initialProps: Record<string, string> = {};
  public jsBundleProvider: JSBundleProvider | undefined = undefined;
  public wrappedCustomRNComponentBuilder: WrappedCustomRNComponentBuilder | undefined = undefined;
  public onSetUp: (rnInstance: RNInstance) => Promise<void> | void = (): void => {};
  public replaceRNInstance: ExpoRNInstanceReplacement | undefined = undefined;
  @State private generation: number = 0;
  private replacement: RNInstance | undefined = undefined;
  private unregister: (() => void) | undefined = undefined;
  private mounted: boolean = false;
  private serial: number = 0;

  aboutToAppear(): void {
    this.mounted = true;
  }

  aboutToDisappear(): void {
    this.mounted = false;
    this.serial += 1;

    this.unregister?.();
    this.unregister = undefined;
  }

  private instanceConfig(): RNInstanceConfig {
    if (this.replacement !== undefined) {
      const config: ExpoUnmanagedRNInstanceConfig = { rnInstance: this.replacement };
      return config;
    }
    return this.rnInstanceConfig;
  }

  private async setUp(instance: RNInstance): Promise<void> {
    const setup: number = ++this.serial;
    this.unregister?.();
    this.unregister = undefined;

    await this.onSetUp(instance);
    if (!this.mounted || setup !== this.serial) return;

    const unmanaged: boolean = Object.keys(this.rnInstanceConfig).includes('rnInstance');
    // No route means Core rejects before invoking destructive preparation.
    if (unmanaged && this.replaceRNInstance === undefined) return;

    this.unregister = ExpoHostReload.register(instance.getId(), async (reason: string): Promise<void> => {
      if (!this.mounted || setup !== this.serial) throw new ExpoModuleError('ERR_RELOAD_UNAVAILABLE', 'The ExpoRNApp owner was unmounted.');

      if (unmanaged) {
        const replace = this.replaceRNInstance;
        if (replace === undefined) throw new ExpoModuleError('ERR_RELOAD_UNAVAILABLE', 'The Host replacement callback was removed.');

        const next = await replace(reason);
        if (!this.mounted || setup !== this.serial) {
          throw new ExpoModuleError('ERR_RELOAD_UNAVAILABLE', 'The ExpoRNApp owner was unmounted during replacement.');
        }
        if (next.getId() === instance.getId()) {
          throw new ExpoModuleError('ERR_RELOAD_HOST_REPLACEMENT', 'The Host replacement callback must return a new RNInstance.');
        }

        this.replacement = next;
      }

      this.unregister?.();
      this.unregister = undefined;

      // Re-key only this RNApp. Its own cleanup/create paths retain ownership of
      // both the old and new managed instances and of their rendered surfaces.
      this.generation += 1;
    });
  }

  build(): void {
    ForEach(
      [this.generation],
      (_generation: number): void => {
        RNApp({
          rnInstanceConfig: this.instanceConfig(),
          appKey: this.appKey,
          initialProps: this.initialProps,
          jsBundleProvider: this.jsBundleProvider,
          wrappedCustomRNComponentBuilder: this.wrappedCustomRNComponentBuilder,
          onSetUp: (instance: RNInstance): Promise<void> => this.setUp(instance),
        });
      },
      (generation: number): string => `${generation}`,
    );
  }
}
