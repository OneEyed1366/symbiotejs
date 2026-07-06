require 'json'
require 'fileutils'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

native_splash_screen_package_json = `node --print "require.resolve('react-native-bootsplash/package.json', { paths: [process.argv[1]] })" "#{__dir__}"`.strip
native_splash_screen_root = File.dirname(native_splash_screen_package_json)

# CocoaPods' file glob never crosses a symlink (Sandbox::PathList#read_file_system walks the
# pod dir with ONE recursive Dir.glob, and Ruby's `**` never descends into a symlinked
# subdirectory it meets mid-walk). Under pnpm, react-native-bootsplash always sits behind a
# .pnpm-store symlink, so pointing source_files at it in place silently produces zero matched
# files -> CocoaPods downgrades the pod to an empty PBXAggregateTarget -> a runtime
# NSClassFromString crash on first launch, not a build error. Fix: vendor (copy) the native iOS
# sources into a gitignored folder next to this podspec on every `pod install`, and point
# source_files at that copy (a purely-downward relative pattern).
vendored_dir = File.join(__dir__, '.rn-bootsplash')

FileUtils.rm_rf(vendored_dir)
FileUtils.mkdir_p(vendored_dir)
FileUtils.cp_r(File.join(native_splash_screen_root, 'ios'), File.join(vendored_dir, 'ios'))

Pod::Spec.new do |s|
  s.name         = 'symbiote-splash-screen'
  s.version      = package['version']
  s.summary      = 'Symbiote wrapper for the react-native-bootsplash native splash-screen module.'
  s.license      = package['license'] || 'MIT'
  s.authors      = package['author'] || 'symbiote'
  s.homepage     = package['homepage'] || 'https://github.com/symbiote/symbiote'
  s.platforms    = { :ios => '13.4' }
  s.source       = { :git => 'https://github.com/symbiote/symbiote.git', :tag => "v#{s.version}" }

  # react-native-bootsplash's own docs have callers `import RNBootSplash` directly in
  # AppDelegate.swift — that import name is the Clang MODULE name, which CocoaPods derives
  # from the pod's `s.name` unless told otherwise. Since this proxy pod is deliberately
  # named after this package (`symbiote-splash-screen`, one-dependency-proxy pattern), the
  # module would default to `symbiote_splash_screen` and break that import. Pin it back to
  # the name upstream's native init instructions expect.
  s.module_name  = 'RNBootSplash'

  s.source_files = '.rn-bootsplash/ios/**/*.{h,m,mm}'

  if defined?(install_modules_dependencies)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
    s.compiler_flags = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32 -DRCT_NEW_ARCH_ENABLED=1'
    s.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => '"$(PODS_ROOT)/boost"',
      'OTHER_CPLUSPLUSFLAGS' => '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1',
      'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17'
    }
    s.dependency 'ReactCommon/turbomodule/core'
  end

  # `module_name` alone only picks the NAME of the Clang module — it does not make CocoaPods
  # generate one. For a static-library pod (no use_frameworks!), a module map is only emitted
  # when DEFINES_MODULE is YES, and install_modules_dependencies(s) does not set it for us.
  # Without this, `import RNBootSplash` in AppDelegate.swift fails with "no such module".
  # `pod_target_xcconfig` has a DSL writer but no plain reader, so read the raw value back
  # through `attributes_hash` (what install_modules_dependencies(s) already wrote into)
  # instead of `s.pod_target_xcconfig`, which raises NoMethodError.
  s.pod_target_xcconfig = (s.attributes_hash['pod_target_xcconfig'] || {}).merge('DEFINES_MODULE' => 'YES')
end
