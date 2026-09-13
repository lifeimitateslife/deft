#include <node_api.h>
#import <Cocoa/Cocoa.h>
#include <dlfcn.h>
#include <cstring>
#include <cmath>

// WindowServer has no public blur-radius setter. Resolve these optional symbols
// at runtime so an OS change falls back to Electron's standard vibrancy.
using Connection = int (*)();
using SetRadius = int (*)(int, uint32_t, uint32_t);
static Connection connection = nullptr;
static SetRadius setRadius = nullptr;

static napi_value Apply(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2], result;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  bool isBuffer = false;
  void *bytes = nullptr;
  size_t length = 0;
  double strength = -1;
  if (argc != 2 || napi_is_buffer(env, args[0], &isBuffer) != napi_ok || !isBuffer ||
      napi_get_buffer_info(env, args[0], &bytes, &length) != napi_ok || length != sizeof(void*) ||
      napi_get_value_double(env, args[1], &strength) != napi_ok ||
      !std::isfinite(strength) || strength < 0 || strength > 100) {
    napi_throw_type_error(env, nullptr, "Expected a native window handle and blur strength from 0 to 100");
    return nullptr;
  }
  bool applied = false;
  if (connection && setRadius && [NSThread isMainThread]) {
    NSView *view = nullptr;
    std::memcpy(&view, bytes, sizeof(view));
    NSWindow *window = [view window];
    if (window) applied = setRadius(connection(), (uint32_t)[window windowNumber],
                                    (uint32_t)std::lround(strength / 2.0)) == 0;
  }
  napi_get_boolean(env, applied, &result);
  return result;
}

NAPI_MODULE_INIT() {
  void *library = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY | RTLD_LOCAL);
  if (library) {
    connection = reinterpret_cast<Connection>(dlsym(library, "CGSMainConnectionID"));
    setRadius = reinterpret_cast<SetRadius>(dlsym(library, "CGSSetWindowBackgroundBlurRadius"));
  }
  napi_value apply;
  napi_create_function(env, "apply", NAPI_AUTO_LENGTH, Apply, nullptr, &apply);
  napi_set_named_property(env, exports, "apply", apply);
  return exports;
}
