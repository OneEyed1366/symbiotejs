require 'json'
require 'pathname'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

native_slider_package_json = `node --print "require.resolve('@react-native-community/slider/package.json', { paths: [process.argv[1]] })" "#{__dir__}"`.strip
native_slider_root = File.dirname(native_slider_package_json)
native_slider_relative_root = Pathname.new(native_slider_root).relative_path_from(Pathname.new(__dir__)).to_s

Pod::Spec.new do |s|
  s.name         = 'symbiote-slider'
  s.version      = package['version']
  s.summary      = 'Symbiote wrapper for the React Native community slider native view.'
  s.license      = package['license'] || 'MIT'
  s.authors      = package['author'] || 'symbiote'
  s.homepage     = package['homepage'] || 'https://github.com/symbiote/symbiote'
  s.platforms    = { :ios => '9.0', :visionos => '1.0' }
  s.source       = { :git => 'https://github.com/symbiote/symbiote.git', :tag => "v#{s.version}" }

  s.source_files = File.join(native_slider_relative_root, 'ios/**/*.{h,m,mm}')

  s.subspec 'common' do |ss|
    ss.source_files = File.join(native_slider_relative_root, 'common/cpp/**/*.{cpp,h}')
    ss.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => "\"#{File.join(native_slider_root, 'common/cpp')}\""
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
