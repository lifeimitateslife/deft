export async function placeTestWindow(app) {
  if (process.env.DEFT_TEST_SECONDARY !== "1") return;
  await app.evaluate(({ BrowserWindow, screen }) => {
    const display = screen
      .getAllDisplays()
      .find((d) => d.id !== screen.getPrimaryDisplay().id);
    if (!display) throw Error("Requested second monitor is unavailable");
    BrowserWindow.getAllWindows()[0].setBounds({
      x: display.workArea.x + 40,
      y: display.workArea.y + 80,
      width: Math.min(960, display.workArea.width - 80),
      height: 800,
    });
  });
}
