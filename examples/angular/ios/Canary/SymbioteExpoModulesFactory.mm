#import "SymbioteExpoModulesFactory.h"

#if __has_include(<ExpoModulesCore/ExpoModulesCore-Swift.h>)
#import <ExpoModulesCore/ExpoModulesCore-Swift.h>
#else
#import "ExpoModulesCore-Swift.h"
#endif

#import <ExpoModulesCore/EXHostWrapper.h>
#import <ExpoModulesCore/EXReactSchedulerDispatch.h>
#import <ReactCommon/RCTHost.h>
#import <react/renderer/runtimescheduler/RuntimeSchedulerBinding.h>

// Reproduces the `expo` package's own RCTReactNativeFactory subclass hook (normally
// packages/expo/ios/AppDelegates/ExpoReactNativeFactory.mm) using only expo-modules-core
// symbols — this project never depends on the `expo` meta-package itself. Installs
// `global.expo.modules`, the JSI host object requireNativeModule(...) reads to resolve an
// autolinked Expo module. See the symbiote-expo-native-module skill.
@implementation SymbioteExpoModulesFactory {
  EXAppContext *_appContext;
}

- (void)host:(nonnull RCTHost *)host didInitializeRuntime:(facebook::jsi::Runtime &)runtime
{
  _appContext = [[EXAppContext alloc] init];

  auto binding = facebook::react::RuntimeSchedulerBinding::getBinding(runtime);
  auto scheduler = binding ? binding->getRuntimeScheduler() : nullptr;
  void *schedulerHandle = expo::createReactSchedulerHandle(scheduler);

  [_appContext setRuntime:&runtime
                scheduler:schedulerHandle
                 dispatch:schedulerHandle ? reinterpret_cast<const void *>(&expo::dispatchOnReactScheduler) : nullptr];
  [_appContext setHostWrapper:[[EXHostWrapper alloc] initWithHost:host]];
  [_appContext registerNativeModules];
}

@end
