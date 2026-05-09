import lynxtron from 'liblynxtron.so';
import hilog from '@ohos.hilog';

const DOMAIN = 0x0000;
const TAG = 'Lynxtron';

@Entry
@Component
struct Index {
  @State message: string = 'Lynxtron HarmonyOS bring-up';
  @State lastResult: string = '(not started yet)';

  build() {
    Row() {
      Column() {
        Text(this.message)
          .fontSize(24)
          .fontWeight(FontWeight.Bold)
          .margin({ bottom: 16 })

        Text('Result: ' + this.lastResult)
          .fontSize(16)
          .margin({ bottom: 16 })

        Button('Start LynxtronMain')
          .onClick(() => {
            try {
              const rc: number = lynxtron.start();
              hilog.info(DOMAIN, TAG, 'lynxtron.start returned: %{public}d', rc);
              this.lastResult = 'rc=' + rc;
            } catch (e) {
              hilog.error(DOMAIN, TAG, 'lynxtron.start threw: %{public}s',
                JSON.stringify(e) ?? '');
              this.lastResult = 'error: ' + JSON.stringify(e);
            }
          })
      }
      .width('100%')
    }
    .height('100%')
  }
}
