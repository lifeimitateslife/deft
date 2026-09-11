export async function menuCommand(app, page, group, label) {
  if (process.platform === "darwin") {
    await app.evaluate(
      ({ Menu, BrowserWindow }, { group, label }) => {
        const menu = Menu.getApplicationMenu();
        const section = menu.items.find((item) => item.label === group);
        const item = section?.submenu?.items.find(
          (item) => item.label === label,
        );
        if (!item) throw Error(`Missing native menu ${group}/${label}`);
        item.click(undefined, BrowserWindow.getAllWindows()[0], {});
      },
      { group, label },
    );
  } else {
    await page
      .getByRole("button", { name: "Application menu", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: group, exact: true })
      .first()
      .click();
    await page
      .getByRole("menuitem", { name: label, exact: true })
      .last()
      .click();
  }
}
export async function openFormat(app, page) {
  if (process.platform === "darwin") {
    await page.locator(".document").click({ button: "right" });
  } else {
    await page
      .getByRole("button", { name: "Application menu", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Format", exact: true }).click();
  }
}
