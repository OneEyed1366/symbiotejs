require 'json'
require 'fileutils'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

native_slider_package_json = `node --print "require.resolve('@react-native-community/slider/package.json', { paths: [process.argv[1]] })" "#{__dir__}"`.strip
native_slider_root = File.dirname(native_slider_package_json)

# CocoaPods' file glob never crosses a symlink (Sandbox::PathList#read_file_system walks the
# pod dir with ONE recursive Dir.glob, and Ruby's `**` never descends into a symlinked
# subdirectory it meets mid-walk). Under pnpm, @react-native-community/slider always sits
# behind a .pnpm-store symlink, so pointing source_files at it via a relative path silently
# produces zero matched files -> CocoaPods downgrades the pod to an empty PBXAggregateTarget
# -> RNCSliderComponentView never gets compiled -> NSClassFromString returns nil at runtime
# -> a crash when RCTThirdPartyComponentsProvider inserts that nil into an NSDictionary
# literal (Objective-C literals reject nil values). Fix: vendor (copy) the native iOS/common
# sources into a gitignored folder next to this podspec on every `pod install`, and point
# source_files at that copy (a purely-downward relative pattern) — same fix already applied
# to packages/splash-screen/symbiote-splash-screen.podspec.
vendored_dir = File.join(__dir__, '.rn-slider')

FileUtils.rm_rf(vendored_dir)
FileUtils.mkdir_p(vendored_dir)
FileUtils.cp_r(File.join(native_slider_root, 'ios'), File.join(vendored_dir, 'ios'))
FileUtils.cp_r(File.join(native_slider_root, 'common'), File.join(vendored_dir, 'common'))

Pod::Spec.new do |s|
  s.name         = 'symbiote-slider'
  s.version      = package['version']
  s.summary      = 'Symbiote wrapper for the React Native community slider native view.'
  s.license      = package['license'] || 'MIT'
  s.authors      = package['author'] || 'symbiote'
  s.homepage     = package['homepage'] || 'https://github.com/symbiote/symbiote'
  s.platforms    = { :ios => '9.0', :visionos => '1.0' }
  s.source       = { :git => 'https://github.com/symbiote/symbiote.git', :tag => "v#{s.version}" }

  s.source_files = '.rn-slider/ios/**/*.{h,m,mm}'

  s.subspec 'common' do |ss|
    ss.source_files = '.rn-slider/common/cpp/**/*.{cpp,h}'
    ss.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => "\"#{File.join(vendored_dir, 'common/cpp')}\""
    }
  end

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
    s.dependency 'React-RCTFabric'
    s.dependency 'React-Codegen'
    s.dependency 'RCT-Folly'
    s.dependency 'RCTRequired'
    s.dependency 'RCTTypeSafety'
    s.dependency 'ReactCommon/turbomodule/core'
  end
end
