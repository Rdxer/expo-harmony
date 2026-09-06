#pragma once

#include <RNOH/Package.h>

namespace expo::harmony {

class ExpoModulesCoreTurboModuleFactoryDelegate final
    : public rnoh::TurboModuleFactoryDelegate {
public:
  SharedTurboModule createTurboModule(
      Context context,
      const std::string &name) const override;
};

class ExpoModulesCorePackage final : public rnoh::Package {
public:
  explicit ExpoModulesCorePackage(Package::Context context)
      : Package(std::move(context)) {}

  std::unique_ptr<rnoh::TurboModuleFactoryDelegate>
  createTurboModuleFactoryDelegate() override;

  std::vector<facebook::react::ComponentDescriptorProvider>
  createComponentDescriptorProviders() override;

  rnoh::ComponentNapiBinderByString createComponentNapiBinderByName() override;

  rnoh::ComponentInstance::Shared createComponentInstance(
      const rnoh::ComponentInstance::Context &context) override;

  rnoh::EventEmitRequestHandlers createEventEmitRequestHandlers() override;

  std::vector<rnoh::ArkTSMessageHandler::Shared> createArkTSMessageHandlers() override;
};

}  // namespace expo::harmony
