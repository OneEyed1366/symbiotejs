import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import RNBootSplash
internal import ExpoModulesCore // matches ExpoModulesProvider.swift's own import level

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = SymbioteExpoModulesFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "Canary",
      in: window,
      launchOptions: launchOptions
    )

    return ExpoAppDelegateSubscriberManager.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Forward the rest of UIApplicationDelegate's lifecycle to ExpoAppDelegateSubscriberManager so
  // any autolinked Expo module that registers a subscriber keeps working — expo-sensors
  // registers none today, this just keeps future expo-modules-core packages working for free.
  func applicationDidBecomeActive(_ application: UIApplication) {
    ExpoAppDelegateSubscriberManager.applicationDidBecomeActive(application)
  }

  func applicationWillResignActive(_ application: UIApplication) {
    ExpoAppDelegateSubscriberManager.applicationWillResignActive(application)
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    ExpoAppDelegateSubscriberManager.applicationDidEnterBackground(application)
  }

  func applicationWillEnterForeground(_ application: UIApplication) {
    ExpoAppDelegateSubscriberManager.applicationWillEnterForeground(application)
  }

  func applicationWillTerminate(_ application: UIApplication) {
    ExpoAppDelegateSubscriberManager.applicationWillTerminate(application)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }

  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
  }
}
