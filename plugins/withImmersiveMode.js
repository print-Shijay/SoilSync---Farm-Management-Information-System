const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: withImmersiveMode
 * 
 * Automatically configures MainActivity.kt for persistent Android immersive mode across
 * all Android versions (API 21 to 35+).
 * 
 * Ensures:
 * 1. WindowCompat.setDecorFitsSystemWindows(window, false) for edge-to-edge drawing
 * 2. WindowInsetsControllerCompat with BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE so first taps pass directly to inputs
 * 3. ViewCompat.setOnApplyWindowInsetsListener so keyboard (IME) appearance never reveals the navigation bar
 */
const withImmersiveMode = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const mainActivityPath = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java/com/shijaydev/SoilSync/MainActivity.kt'
      );

      if (!fs.existsSync(mainActivityPath)) {
        return config;
      }

      let content = await fs.promises.readFile(mainActivityPath, 'utf8');

      // Check if already configured
      if (content.includes('setOnApplyWindowInsetsListener')) {
        return config;
      }

      // 1. Ensure required AndroidX imports are present
      const imports = [
        'import android.view.View',
        'import androidx.core.view.ViewCompat',
        'import androidx.core.view.WindowCompat',
        'import androidx.core.view.WindowInsetsCompat',
        'import androidx.core.view.WindowInsetsControllerCompat',
      ];

      for (const imp of imports) {
        if (!content.includes(imp)) {
          content = content.replace(
            'package com.shijaydev.SoilSync\n',
            `package com.shijaydev.SoilSync\n\n${imp}`
          );
        }
      }

      // 2. Inject onCreate insets listener and initial hide call
      const onCreateInjection = `
    hideSystemBars()

    // Permanently maintain immersive mode across all window inset changes (IME/keyboard, rotations, etc.)
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      try {
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = androidx.core.view.WindowCompat.getInsetsController(window, view)
        controller.systemBarsBehavior =
            androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(androidx.core.view.WindowInsetsCompat.Type.navigationBars())
      } catch (e: Exception) {
        // Fallback guard
      }
      androidx.core.view.ViewCompat.onApplyWindowInsets(view, insets)
    }
`;

      if (!content.includes('setOnApplyWindowInsetsListener')) {
        content = content.replace(
          /super\.onCreate\(null\)/,
          `super.onCreate(null)${onCreateInjection}`
        );
      }

      // 3. Inject onResume and robust hideSystemBars implementation
      const helperMethods = `
  override fun onResume() {
      super.onResume()
      hideSystemBars()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
      super.onWindowFocusChanged(hasFocus)
      if (hasFocus) {
          hideSystemBars()
      }
  }

  private fun hideSystemBars() {
      try {
          // Tell the window to draw edge-to-edge behind system bars
          androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)

          val windowInsetsController = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
          // Ensure swipes show transient overlay, and taps pass directly through to app inputs (no double-tap required)
          windowInsetsController.systemBarsBehavior =
              androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          windowInsetsController.hide(androidx.core.view.WindowInsetsCompat.Type.navigationBars())
      } catch (e: Exception) {
          @Suppress("DEPRECATION")
          window.decorView.systemUiVisibility = (
              android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
              or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
              or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
              or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
              or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          )
      }
  }
`;

      if (content.includes('private fun hideSystemBars()')) {
        // Replace existing hideSystemBars implementation
        content = content.replace(
          /(override fun onResume\(\)[\s\S]*?private fun hideSystemBars\(\)[\s\S]*?\n  \}|override fun onWindowFocusChanged\([\s\S]*?private fun hideSystemBars\(\)[\s\S]*?\n  \})/,
          helperMethods.trim()
        );
      } else {
        // Insert before last closing brace
        const lastBraceIndex = content.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          content =
            content.slice(0, lastBraceIndex) +
            helperMethods +
            '\n' +
            content.slice(lastBraceIndex);
        }
      }

      await fs.promises.writeFile(mainActivityPath, content, 'utf8');
      return config;
    },
  ]);
};

module.exports = withImmersiveMode;
