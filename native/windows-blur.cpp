// MIT licensed. Windows Composition owns the backdrop; no screen capture,
// injected code, or global DWM modifications are used by this backend.
#include <node_api.h>
#include <windows.h>
#include <dispatcherqueue.h>
#include <windows.ui.composition.interop.h>
#include <windows.graphics.effects.interop.h>
#include <d2d1effects.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Graphics.Effects.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.UI.Composition.h>
#include <winrt/Windows.UI.Composition.Desktop.h>
#include <cmath>
#include <memory>

using namespace winrt;
using namespace Windows::UI::Composition;
using namespace Windows::Graphics::Effects;
using namespace Windows::Foundation;
using ABI::Windows::Graphics::Effects::IGraphicsEffectD2D1Interop;
using ABI::Windows::Graphics::Effects::GRAPHICS_EFFECT_PROPERTY_MAPPING;
using ABI::Windows::Graphics::Effects::GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT;

struct Gaussian : implements<Gaussian, IGraphicsEffect, IGraphicsEffectSource,
                              IGraphicsEffectD2D1Interop> {
  hstring name{L"Blur"};
  IGraphicsEffectSource source{CompositionEffectSourceParameter(L"Backdrop")};
  hstring Name() { return name; }
  void Name(hstring const& value) { name = value; }
  HRESULT __stdcall GetEffectId(GUID* id) noexcept override {
    if (!id) return E_POINTER;
    *id = CLSID_D2D1GaussianBlur;
    return S_OK;
  }
  HRESULT __stdcall GetNamedPropertyMapping(LPCWSTR name, UINT* index,
      GRAPHICS_EFFECT_PROPERTY_MAPPING* mapping) noexcept override {
    if (!name || !index || !mapping) return E_POINTER;
    if (wcscmp(name, L"StandardDeviation")) return E_INVALIDARG;
    *index = 0;
    *mapping = GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT;
    return S_OK;
  }
  HRESULT __stdcall GetPropertyCount(UINT* count) noexcept override {
    if (!count) return E_POINTER;
    *count = 3;
    return S_OK;
  }
  HRESULT __stdcall GetProperty(UINT index, ABI::Windows::Foundation::IPropertyValue** value) noexcept override {
    if (!value) return E_POINTER;
    *value = nullptr;
    try {
      Windows::Foundation::IInspectable property{nullptr};
      if (index == 0) property = PropertyValue::CreateSingle(0.f);
      else if (index == 1) property = PropertyValue::CreateUInt32(D2D1_GAUSSIANBLUR_OPTIMIZATION_BALANCED);
      else if (index == 2) property = PropertyValue::CreateUInt32(D2D1_BORDER_MODE_HARD);
      else return E_INVALIDARG;
      return property.as<::IInspectable>()->QueryInterface(IID_PPV_ARGS(value));
    } catch (...) { return to_hresult(); }
  }
  HRESULT __stdcall GetSourceCount(UINT* count) noexcept override {
    if (!count) return E_POINTER;
    *count = 1;
    return S_OK;
  }
  HRESULT __stdcall GetSource(UINT index, ABI::Windows::Graphics::Effects::IGraphicsEffectSource** value) noexcept override {
    if (!value) return E_POINTER;
    *value = nullptr;
    if (index != 0) return E_INVALIDARG;
    return source.as<::IInspectable>()->QueryInterface(IID_PPV_ARGS(value));
  }
};

struct Backdrop {
  Windows::System::DispatcherQueueController queue{nullptr};
  Compositor compositor{nullptr};
  Desktop::DesktopWindowTarget target{nullptr};
  SpriteVisual visual{nullptr};
  CompositionEffectBrush brush{nullptr};
  HWND window{};
  explicit Backdrop(HWND hwnd) : window(hwnd) {
    if (!Windows::System::DispatcherQueue::GetForCurrentThread()) {
      DispatcherQueueOptions options{sizeof(options), DQTYPE_THREAD_CURRENT, DQTAT_COM_NONE};
      check_hresult(CreateDispatcherQueueController(options,
        reinterpret_cast<ABI::Windows::System::IDispatcherQueueController**>(put_abi(queue))));
    }
    compositor = Compositor();
    check_hresult(compositor.as<ABI::Windows::UI::Composition::Desktop::ICompositorDesktopInterop>()
      ->CreateDesktopWindowTarget(hwnd, false,
        reinterpret_cast<ABI::Windows::UI::Composition::Desktop::IDesktopWindowTarget**>(put_abi(target))));
    if (!target) throw hresult_error(E_FAIL, L"Desktop composition target unavailable");
    visual = compositor.CreateSpriteVisual();
    visual.RelativeSizeAdjustment({1.f, 1.f});
    auto effect = make<Gaussian>();
    brush = compositor.CreateEffectFactory(effect, {L"Blur.StandardDeviation"}).CreateBrush();
    brush.SetSourceParameter(L"Backdrop", compositor.CreateBackdropBrush());
    visual.Brush(brush);
    target.Root(visual);
  }
  void apply(double strength) {
    brush.Properties().InsertScalar(L"Blur.StandardDeviation", static_cast<float>(strength * .5));
    visual.IsVisible(strength > 0);
  }
  ~Backdrop() {
    if (target) { target.Root(nullptr); target.Close(); }
    if (compositor) compositor.Close();
    // DispatcherQueue is thread-owned and shuts down with Electron's UI thread.
  }
};

static std::unique_ptr<Backdrop> backdrop;
static napi_value apply(napi_env env, napi_callback_info info) {
  napi_value args[2], result;
  size_t count = 2, length = 0;
  void* bytes = nullptr;
  double strength = 0;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  bool success = false;
  if (count == 2 && napi_get_buffer_info(env, args[0], &bytes, &length) == napi_ok &&
      length == sizeof(HWND) && napi_get_value_double(env, args[1], &strength) == napi_ok &&
      std::isfinite(strength) && strength >= 0 && strength <= 100) {
    HWND hwnd{};
    memcpy(&hwnd, bytes, sizeof(hwnd));
    DWORD owner = 0;
    DWORD thread = GetWindowThreadProcessId(hwnd, &owner);
    if (owner == GetCurrentProcessId() && thread == GetCurrentThreadId() && IsWindow(hwnd)) {
      try {
        if (!backdrop || backdrop->window != hwnd) backdrop = std::make_unique<Backdrop>(hwnd);
        backdrop->apply(strength);
        success = true;
      } catch (hresult_error const& error) {
        OutputDebugStringW(error.message().c_str());
        backdrop.reset();
      } catch (...) { backdrop.reset(); }
    }
  }
  napi_get_boolean(env, success, &result);
  return result;
}
static napi_value release(napi_env env, napi_callback_info) {
  backdrop.reset();
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"apply", nullptr, apply, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"release", nullptr, release, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 2, properties);
  napi_add_env_cleanup_hook(env, [](void*) { backdrop.reset(); }, nullptr);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
