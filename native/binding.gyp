{
  "targets": [{
    "target_name": "windows-blur",
    "sources": ["windows-blur.cpp"],
    "defines": ["NAPI_VERSION=8", "NOMINMAX", "WIN32_LEAN_AND_MEAN"],
    "libraries": ["windowsapp.lib", "CoreMessaging.lib", "d2d1.lib", "dxguid.lib"],
    "msvs_settings": {
      "VCCLCompilerTool": {"AdditionalOptions": ["/std:c++20", "/EHsc"], "ExceptionHandling": 1}
    }
  }]
}
