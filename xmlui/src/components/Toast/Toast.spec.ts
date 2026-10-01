import { expect, test } from "../../testing/fixtures";

// =============================================================================
// BASIC FUNCTIONALITY TESTS
// =============================================================================

test.describe("Basic Functionality", () => {
  test("notifications do not intercept dialog controls and remain dismissible afterward", async ({ page, initTestBed }) => {
    const { testStateDriver } = await initTestBed(`
      <Fragment>
        <Button onClick="toastComponent.loading('A detailed notification that remains visible while choosing a record')">Show notification</Button>
        <Button onClick="modal.open()">Open picker</Button>
        <Toast id="toastComponent"><Text>{$param}</Text></Toast>
        <ModalDialog id="modal" fullScreen="true" closeButtonVisible="false">
          <HStack horizontalAlignment="end" paddingTop="45px" paddingRight="60px">
            <Button testId="confirm" onClick="testState = 'confirmed'; modal.close()">Confirm selection</Button>
          </HStack>
        </ModalDialog>
      </Fragment>
    `);
    await expect(page.getByRole("button", { name: "Show notification" })).toBeVisible();
    await page.getByRole("button", { name: "Show notification" }).click();
    const notice = page.getByRole("status", { includeHidden: true });
    await expect(notice).toBeVisible();
    await page.getByRole("button", { name: "Open picker" }).click();
    const confirm = page.getByTestId("confirm");
    await expect(confirm).toBeVisible();
    // A real pointer click at the overlapping screen position must reach the dialog,
    // not dismiss the toast and trigger the dialog's click-away handler.
    const bounds = await confirm.boundingBox();
    await expect.poll(async () => {
      const noticeBounds = await notice.boundingBox();
      const x = bounds!.x + bounds!.width / 2;
      const y = bounds!.y + bounds!.height / 2;
      return noticeBounds && x > noticeBounds.x && x < noticeBounds.x + noticeBounds.width &&
        y > noticeBounds.y && y < noticeBounds.y + noticeBounds.height;
    }).toBe(true);
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await expect.poll(testStateDriver.testState).toEqual("confirmed");
    await expect(confirm).not.toBeVisible();
    await expect(notice).toBeVisible();
    await notice.click();
    await expect(notice).not.toBeVisible();
  });

  test("notifications do not cover controls in an initially open dialog", async ({ page, initTestBed }) => {
    const { testStateDriver } = await initTestBed(`
      <Fragment>
        <Toast id="notice"><Text>{$param}</Text></Toast>
        <ModalDialog when="{true}" fullScreen="true" closeButtonVisible="true">
          <Button onClick="notice.loading('A detailed notification that remains visible while choosing a record')">Notify from dialog</Button>
          <HStack horizontalAlignment="end">
            <Button testId="confirm" onClick="testState = 'confirmed'">Confirm selection</Button>
          </HStack>
        </ModalDialog>
      </Fragment>
    `);
    await expect(page.getByRole("button", { name: "Notify from dialog" })).toBeVisible();
    await page.getByRole("button", { name: "Notify from dialog" }).click();
    await expect(page.getByRole("status", { includeHidden: true })).toBeVisible();
    await page.getByTestId("confirm").click({ timeout: 3000 });
    await expect.poll(testStateDriver.testState).toEqual("confirmed");
    await page.getByRole("button", { name: "Close", exact: true }).click();
  });

  test("renders toast using show API", async ({ page, initTestBed }) => {
    await initTestBed(`
      <Fragment>
        <Button testId="show-btn" onClick="toastComponent.show('Basic toast message')">
          Show Toast
        </Button>
        <Toast id="toastComponent">
          <Text testId="toast-content">{$param}</Text>
        </Toast>
      </Fragment>
    `);

    await expect(page.getByTestId("toast-content")).not.toBeVisible();
    await page.getByTestId("show-btn").click();
    await expect(page.getByTestId("toast-content")).toBeVisible();
    await expect(page.getByTestId("toast-content")).toHaveText("Basic toast message");
  });

  test("renders success toast using success API", async ({ page, initTestBed }) => {
    await initTestBed(`
      <Fragment>
        <Button testId="success-btn" onClick="toastComponent.success('Success message')">
          Show Success
        </Button>
        <Toast id="toastComponent">
          <property name="successTemplate">
            <Text testId="success-content">✓ {$param}</Text>
          </property>
        </Toast>
      </Fragment>
    `);

    await page.getByTestId("success-btn").click();
    await expect(page.getByTestId("success-content")).toBeVisible();
    await expect(page.getByTestId("success-content")).toHaveText("✓ Success message");
  });

  test("renders error toast using error API", async ({ page, initTestBed }) => {
    await initTestBed(`
      <Fragment>
        <Button testId="error-btn" onClick="toastComponent.error('Error occurred')">
          Show Error
        </Button>
        <Toast id="toastComponent">
          <property name="errorTemplate">
            <Text testId="error-content">✗ {$param}</Text>
          </property>
        </Toast>
      </Fragment>
    `);

    await page.getByTestId("error-btn").click();
    await expect(page.getByTestId("error-content")).toBeVisible();
    await expect(page.getByTestId("error-content")).toHaveText("✗ Error occurred");
  });

  test("renders loading toast using loading API", async ({ page, initTestBed }) => {
    await initTestBed(`
      <Fragment>
        <Button testId="loading-btn" onClick="toastComponent.loading('Loading...')">
          Show Loading
        </Button>
        <Toast id="toastComponent">
          <property name="loadingTemplate">
            <Text testId="loading-content">⏳ {$param}</Text>
          </property>
        </Toast>
      </Fragment>
    `);

    await page.getByTestId("loading-btn").click();
    await expect(page.getByTestId("loading-content")).toBeVisible();
    await expect(page.getByTestId("loading-content")).toHaveText("⏳ Loading...");
  });

  test("updates existing toast when called multiple times", async ({ page, initTestBed }) => {
    await initTestBed(`
      <Fragment>
        <Button testId="first-btn" onClick="toastComponent.show('First message')">
          First
        </Button>
        <Button testId="second-btn" onClick="toastComponent.show('Second message')">
          Second
        </Button>
        <Toast id="toastComponent">
          <Text testId="toast-content">{$param}</Text>
        </Toast>
      </Fragment>
    `);

    // Show first toast
    await page.getByTestId("first-btn").click();
    await expect(page.getByTestId("toast-content")).toHaveText("First message");

    // Update to second toast
    await page.getByTestId("second-btn").click();
    await expect(page.getByTestId("toast-content")).toHaveText("Second message");
  });

  test("$param context variable passes data to default template", async ({ page, initTestBed }) => {
    await initTestBed(`
      <Fragment>
        <Button testId="btn" onClick="toastComponent.show({ title: 'Test', count: 42 })">
          Show Toast
        </Button>
        <Toast id="toastComponent">
          <Text testId="title">{$param.title}</Text>
          <Text testId="count">{$param.count}</Text>
        </Toast>
      </Fragment>
    `);

    await page.getByTestId("btn").click();
    await expect(page.getByTestId("title")).toHaveText("Test");
    await expect(page.getByTestId("count")).toHaveText("42");
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

test.describe("Accessibility", () => {
  test("toast has role='status' for screen readers", async ({ page, initTestBed }) => {
    await initTestBed(`
      <Fragment>
        <Button testId="btn" onClick="toastComponent.show('Accessible message')">
          Show Toast
        </Button>
        <Toast id="toastComponent">
          <Text>{$param}</Text>
        </Toast>
      </Fragment>
    `);

    await page.getByTestId("btn").click();
    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
  });
});
