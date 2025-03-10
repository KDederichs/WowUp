import {
  BehaviorSubject,
  catchError,
  debounceTime,
  first,
  from,
  Observable,
  of,
  Subject,
  switchMap,
  takeUntil,
  zip,
} from "rxjs";

import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { UntypedFormControl } from "@angular/forms";
import { MatListOption, MatSelectionListChange } from "@angular/material/list";
import { TranslateService } from "@ngx-translate/core";

import {
  ADDON_PROVIDER_WAGO,
  PREF_GITHUB_PERSONAL_ACCESS_TOKEN,
  PREF_WAGO_ACCESS_KEY,
} from "../../../../common/constants";
import { AppConfig } from "../../../../environments/environment";
import { AddonProviderState } from "../../../models/wowup/addon-provider-state";
import { AddonProviderFactory } from "../../../services/addons/addon.provider.factory";
import { DialogFactory } from "../../../services/dialog/dialog.factory";
import { LinkService } from "../../../services/links/link.service";
import { SensitiveStorageService } from "../../../services/storage/sensitive-storage.service";
import { formatDynamicLinks } from "../../../utils/dom.utils";
import { FormGroup } from "@angular/forms";
import { AddonProviderType } from "wowup-lib-core";

interface AddonProviderStateModel extends AddonProviderState {
  adRequired: boolean;
  providerNote?: string;
}

@Component({
  selector: "app-options-addon-section",
  templateUrl: "./options-addon-section.component.html",
  styleUrls: ["./options-addon-section.component.scss"],
})
export class OptionsAddonSectionComponent implements OnInit, OnDestroy {
  @ViewChild("prefForm", { read: ElementRef }) public prefForm!: ElementRef;

  private destroy$: Subject<boolean> = new Subject<boolean>();

  public addonProviderStates$ = new BehaviorSubject<AddonProviderStateModel[]>([]);

  public preferenceForm = new FormGroup({
    ghPersonalAccessToken: new UntypedFormControl(""),
    wagoAccessToken: new UntypedFormControl(""),
  });

  public constructor(
    private _addonProviderService: AddonProviderFactory,
    private _sensitiveStorageService: SensitiveStorageService,
    private _translateService: TranslateService,
    private _dialogFactory: DialogFactory,
    private _linkService: LinkService
  ) {
    this._addonProviderService.addonProviderChange$.subscribe(() => {
      this.loadProviderStates();
    });

    this.preferenceForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        switchMap((ch) => {
          const tasks: Observable<any>[] = [];
          if (typeof ch?.ghPersonalAccessToken === "string") {
            tasks.push(
              from(this._sensitiveStorageService.setAsync(PREF_GITHUB_PERSONAL_ACCESS_TOKEN, ch.ghPersonalAccessToken))
            );
          }
          if (typeof ch?.wagoAccessToken === "string") {
            tasks.push(from(this.onWagoAccessTokenChange(ch.wagoAccessToken)));
          }
          return zip(tasks);
        }),
        catchError((e) => {
          console.error(e);
          return of(undefined);
        })
      )
      .subscribe();
  }

  public ngOnInit(): void {
    this.loadProviderStates();
    this.loadSensitiveData().catch(console.error);
  }

  public ngAfterViewChecked(): void {
    const descriptionContainer: HTMLDivElement = this.prefForm?.nativeElement;
    formatDynamicLinks(descriptionContainer, this.onOpenLink);
  }

  public ngOnDestroy(): void {
    this.destroy$.next(true);
    this.destroy$.unsubscribe();
  }

  public async onProviderStateSelectionChange(event: MatSelectionListChange): Promise<void> {
    for (const option of event.options) {
      const providerName: AddonProviderType = option.value;
      if (option.selected && providerName === ADDON_PROVIDER_WAGO) {
        this.onWagoEnable(option);
      } else {
        await this._addonProviderService.setProviderEnabled(providerName, option.selected);
      }
    }
  }

  private onWagoEnable(option: MatListOption) {
    const providerName: AddonProviderType = option.value;
    const title: string = this._translateService.instant("DIALOGS.PERMISSIONS.WAGO.TOGGLE_LABEL");
    const message: string = this._translateService.instant("DIALOGS.PERMISSIONS.WAGO.DESCRIPTION", {
      termsUrl: AppConfig.wago.termsUrl,
      dataUrl: AppConfig.wago.dataConsentUrl,
    });

    const dialogRef = this._dialogFactory.getConfirmDialog(title, message);
    dialogRef
      .afterClosed()
      .pipe(
        first(),
        switchMap((result) => {
          if (result) {
            return from(this._addonProviderService.setProviderEnabled(providerName, option.selected));
          } else {
            option.selected = !option.selected;
          }
          return of(undefined);
        }),
        catchError((err) => {
          console.error(err);
          return of(undefined);
        })
      )
      .subscribe();
  }

  public onOpenLink = (element: HTMLAnchorElement): boolean => {
    this._linkService.confirmLinkNavigation(element.href).subscribe();

    return false;
  };

  private async loadSensitiveData() {
    try {
      const ghPersonalAccessToken = await this._sensitiveStorageService.getAsync(PREF_GITHUB_PERSONAL_ACCESS_TOKEN);
      const wagoAccessToken = await this._sensitiveStorageService.getAsync(PREF_WAGO_ACCESS_KEY);

      this.preferenceForm.get("ghPersonalAccessToken")?.setValue(ghPersonalAccessToken);
      this.preferenceForm.get("wagoAccessToken")?.setValue(wagoAccessToken);
    } catch (e) {
      console.error(e);
    }
  }

  private loadProviderStates() {
    const providerStates = this._addonProviderService.getAddonProviderStates().filter((provider) => provider.canEdit);
    const providerStateModels: AddonProviderStateModel[] = providerStates.map((state) => {
      const provider = this._addonProviderService.getProvider(state.providerName);
      if (provider === undefined) {
        throw new Error("loadProviderStates got undefined provider");
      }

      return { ...state, adRequired: provider.adRequired, providerNote: provider.providerNote };
    });

    this.addonProviderStates$.next(providerStateModels);
  }

  private async onWagoAccessTokenChange(accessToken: string | undefined) {
    await this._sensitiveStorageService.setAsync(PREF_WAGO_ACCESS_KEY, accessToken);

    const wago = this._addonProviderService.getProvider(ADDON_PROVIDER_WAGO);
    if (wago === undefined) {
      console.warn("onWagoAccessTokenChange failed to find wago provider");
      return;
    }

    wago.adRequired = accessToken === undefined || accessToken.length <= 20;

    await this._addonProviderService.setProviderEnabled(ADDON_PROVIDER_WAGO, wago.enabled);
  }
}
