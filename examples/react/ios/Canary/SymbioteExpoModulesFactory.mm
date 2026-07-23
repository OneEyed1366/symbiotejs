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

@implementation SymbioteExpoModulesFactory {
  EXAppContext *_appContext;
}

- (void)host:(nonnull RCTHost *)host didInitializeRuntime:(facebook::jsi::Runtime &)runtime
{
  NSLog(@"[SymbioteDiag] host:didInitializeRuntime: called");
  _appContext = [[EXAppContext alloc] init];
  NSLog(@"[SymbioteDiag] appContext created: %@", _appContext);

  auto binding = facebook::react::RuntimeSchedulerBinding::getBinding(runtime);
  auto scheduler = binding ? binding->getRuntimeScheduler() : nullptr;
  NSLog(@"[SymbioteDiag] runtimeSchedulerBinding=%p scheduler=%p", (void *)binding.get(), scheduler.get());
  void *schedulerHandle = expo::createReactSchedulerHandle(scheduler);

  [_appContext setRuntime:&runtime
                scheduler:schedulerHandle
                 dispatch:schedulerHandle ? reinterpret_cast<const void *>(&expo::dispatchOnReactScheduler) : nullptr];
  NSLog(@"[SymbioteDiag] setRuntime done");
  [_appContext setHostWrapper:[[EXHostWrapper alloc] initWithHost:host]];
  NSLog(@"[SymbioteDiag] setHostWrapper done");
  [_appContext registerNativeModules];
  NSLog(@"[SymbioteDiag] registerNativeModules done");
}

@end
