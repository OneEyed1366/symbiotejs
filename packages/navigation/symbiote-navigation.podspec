require 'json'
require 'fileutils'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

native_screens_package_json = `node --print "require.resolve('react-native-screens/package.json', { paths: [process.argv[1]] })" "#{__dir__}"`.strip
native_screens_root = File.dirname(native_screens_package_json)

# CocoaPods enumerates a pod's files with ONE recursive `Dir.glob(root + '**/*')` walk
# (Sandbox::PathList#read_file_system), and Ruby's `**` never descends into a symlinked
# subdirectory it encounters mid-walk (confirmed: it lists the symlink as an entry but
# never recurses into it) — true whether the symlink crosses the app's node_modules or
# points straight at the vendored library. react-native-screens lives behind pnpm's own
# .pnpm-store symlinks, so no relative-path or same-directory-symlink trick can reach it;
# the files must be REAL entries under this pod's own directory. Physically vendor them
# (directories stay real, so `**` still recurses through them normally) instead of trying
# to glob through any symlink. If this glob ever matches zero files, thirdPartyFabricComponents
# silently gets a nil class entry and Fabric crashes building that dictionary at app startup —
# not a build-time error, since NSClassFromString only resolves at runtime.
vendor_dir = File.join(__dir__, '.rn-screens')
FileUtils.rm_rf(vendor_dir)
FileUtils.mkdir_p(vendor_dir)
%w[ios common cpp].each do |subdir|
  src = File.join(native_screens_root, subdir)
  FileUtils.cp_r(src, File.join(vendor_dir, subdir)) if File.directory?(src)
end

# Swift is excluded: react-native-screens' own podspec only sets DEFINES_MODULE (required
# for its Swift files to build) under an opt-in "gamma" flag, precisely because it conflicts
# with React-RCTImage (a dependency both that podspec and this one carry) not defining a
# module — their own comment says as much ("we can not have Swift code in stable package").
# The only non-gamma Swift file (ios/utils/RNSLog.swift) is a logging helper unused by
# RNSScreen/RNSScreenStack/RNSScreenStackHeaderConfig; everything that imports the Swift
# bridging header lives under ios/gamma/, which is already excluded below. So the stable
# native-stack surface never needs Swift compiled at all — matching upstream's own default.
source_files_exts = '{h,m,mm,cpp}'

Pod::Spec.new do |s|
  s.name         = 'symbiote-navigation'
  s.version      = package['version']
  s.summary      = 'Symbiote wrapper for react-native-screens native stack primitives.'
  s.license      = package['license'] || 'MIT'
  s.authors      = package['author'] || 'symbiote'
  s.homepage     = package['homepage'] || 'https://github.com/symbiote/symbiote'
  s.platforms    = { :ios => '15.1', :visionos => '1.0' }
  s.source       = { :git => 'https://github.com/symbiote/symbiote.git', :tag => "v#{s.version}" }

  s.source_files  = ".rn-screens/ios/**/*.#{source_files_exts}"
  s.exclude_files = ".rn-screens/ios/gamma/**/*.#{source_files_exts}"

  s.subspec 'common' do |ss|
    ss.source_files = [
      '.rn-screens/common/cpp/**/*.{cpp,h}',
      '.rn-screens/cpp/**/*.{cpp,h}',
    ]
    ss.header_dir = 'rnscreens'
    # Must point at the vendored copy, not native_screens_root: an include resolved via
    # this search path pulls in a second, physically distinct copy of the same headers
    # already compiled from .rn-screens/common/cpp, and two distinct files defining the
    # same class have no shared include guard — "redefinition of 'RNSSafeAreaViewState'".
    ss.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => "\"#{File.join(vendor_dir, 'common/cpp')}\""
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
  s.dependency 'React-RCTImage'
end
