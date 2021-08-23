import * as _ from "lodash";
import { BehaviorSubject, from, Subject } from "rxjs";

import { Injectable } from "@angular/core";

import {
  APP_PROTOCOL_NAME,
  SELECTED_DETAILS_TAB_KEY,
  STORAGE_WOWUP_AUTH_TOKEN,
  TAB_INDEX_SETTINGS,
} from "../../../common/constants";
import { WowInstallation } from "../../models/wowup/wow-installation";
import { PreferenceStorageService } from "../storage/preference-storage.service";
import { WarcraftInstallationService } from "../warcraft/warcraft-installation.service";
import { ColumnState } from "../../models/wowup/column-state";
import { ElectronService } from "../electron/electron.service";
import { filter, map, switchMap } from "rxjs/operators";
import { getProtocol } from "../../utils/string.utils";

@Injectable({
  providedIn: "root",
})
export class SessionService {
  private readonly _selectedWowInstallationSrc = new BehaviorSubject<WowInstallation | undefined>(undefined);
  private readonly _pageContextTextSrc = new BehaviorSubject(""); // right side bar text, context to the screen
  private readonly _statusTextSrc = new BehaviorSubject(""); // left side bar text, context to the app
  private readonly _selectedHomeTabSrc = new BehaviorSubject(0);
  private readonly _autoUpdateCompleteSrc = new BehaviorSubject(0);
  private readonly _addonsChangedSrc = new Subject<boolean>();
  private readonly _myAddonsColumnsSrc = new BehaviorSubject<ColumnState[]>([]);
  private readonly _targetFileInstallCompleteSrc = new Subject<boolean>();
  private readonly _wowUpAuthTokenSrc = new BehaviorSubject<string>("");

  private readonly _getAddonsColumnsSrc = new Subject<ColumnState>();

  private _selectedDetailTabType: DetailsTabType;

  public readonly selectedWowInstallation$ = this._selectedWowInstallationSrc.asObservable();
  public readonly statusText$ = this._statusTextSrc.asObservable();
  public readonly selectedHomeTab$ = this._selectedHomeTabSrc.asObservable();
  public readonly pageContextText$ = this._pageContextTextSrc.asObservable();
  public readonly autoUpdateComplete$ = this._autoUpdateCompleteSrc.asObservable();
  public readonly addonsChanged$ = this._addonsChangedSrc.asObservable();
  public readonly myAddonsHiddenColumns$ = this._myAddonsColumnsSrc.asObservable();
  public readonly getAddonsHiddenColumns$ = this._getAddonsColumnsSrc.asObservable();
  public readonly targetFileInstallComplete$ = this._targetFileInstallCompleteSrc.asObservable();
  public readonly editingWowInstallationId$ = new BehaviorSubject<string>("");
  public readonly wowUpAuthToken$ = this._wowUpAuthTokenSrc.asObservable();

  public readonly wowUpAuthenticated$ = this.wowUpAuthToken$.pipe(map((token) => !!token && token.length > 10));

  public constructor(
    private _electronService: ElectronService,
    private _warcraftInstallationService: WarcraftInstallationService,
    private _preferenceStorageService: PreferenceStorageService
  ) {
    this._selectedDetailTabType =
      this._preferenceStorageService.getObject<DetailsTabType>(SELECTED_DETAILS_TAB_KEY) || "description";

    this._warcraftInstallationService.wowInstallations$.subscribe((installations) =>
      this.onWowInstallationsChange(installations)
    );

    this._electronService.customProtocol$
      .pipe(
        filter((protocol) => !!protocol),
        map((protocol) => this.handleLoginProtocol(protocol))
      )
      .subscribe();

    this.loadAuthToken();
  }

  /**
   * Handle the post login protocol message
   * wowup://login/desktop/#{token}
   */
  private handleLoginProtocol = (protocol: string): void => {
    const protocolName = getProtocol(protocol);
    if (protocolName !== APP_PROTOCOL_NAME) {
      return;
    }

    const parts = protocol.split("/");
    if (parts[2] !== "login" || parts[3] !== "desktop") {
      return;
    }

    const token = parts[4];
    if (typeof token !== "string" || token.length < 10) {
      console.warn("Invalid auth token", protocol);
      return;
    }

    console.debug("GOT WOWUP PROTOCOL", protocol);
    window.localStorage.setItem(STORAGE_WOWUP_AUTH_TOKEN, token);
    this._wowUpAuthTokenSrc.next(token);
  };

  private loadAuthToken(): void {
    const storedToken = window.localStorage.getItem(STORAGE_WOWUP_AUTH_TOKEN);
    if (storedToken) {
      this._wowUpAuthTokenSrc.next(storedToken);
    }
  }

  public clearWowUpAuthToken(): void {
    window.localStorage.removeItem(STORAGE_WOWUP_AUTH_TOKEN);
    this._wowUpAuthTokenSrc.next("");
  }

  public isAuthenticated(): boolean {
    return false;
  }

  public notifyTargetFileInstallComplete(): void {
    this._targetFileInstallCompleteSrc.next(true);
  }

  public notifyAddonsChanged(): void {
    this._addonsChangedSrc.next(true);
  }

  public getSelectedDetailsTab(): DetailsTabType {
    return this._selectedDetailTabType;
  }

  public setSelectedDetailsTab(tabType: DetailsTabType): void {
    this._selectedDetailTabType = tabType;
    this._preferenceStorageService.set(SELECTED_DETAILS_TAB_KEY, tabType);
  }

  public onWowInstallationsChange(wowInstallations: WowInstallation[]): void {
    if (wowInstallations.length === 0) {
      this._selectedHomeTabSrc.next(TAB_INDEX_SETTINGS);
      return;
    }

    let selectedInstall = _.find(wowInstallations, (installation) => installation.selected);
    if (!selectedInstall) {
      selectedInstall = _.first(wowInstallations);
      if (selectedInstall) {
        this.setSelectedWowInstallation(selectedInstall.id);
      }
    }

    if (selectedInstall) {
      this._selectedWowInstallationSrc.next(selectedInstall);
    }
  }

  public autoUpdateComplete(): void {
    this._autoUpdateCompleteSrc.next(Date.now());
  }

  public setContextText(tabIndex: number, text: string): void {
    if (tabIndex !== this._selectedHomeTabSrc.value) {
      return;
    }

    this._pageContextTextSrc.next(text);
  }

  public set statusText(text: string) {
    this._statusTextSrc.next(text);
  }

  public getSelectedHomeTab(): number {
    return this._selectedHomeTabSrc.value;
  }

  public set selectedHomeTab(tabIndex: number) {
    this._pageContextTextSrc.next("");
    this._selectedHomeTabSrc.next(tabIndex);
  }

  public setSelectedWowInstallation(installationId: string): void {
    if (!installationId) {
      return;
    }

    const installation = this._warcraftInstallationService.getWowInstallation(installationId);
    if (!installation) {
      return;
    }

    this._warcraftInstallationService.setSelectedWowInstallation(installation);
    this._selectedWowInstallationSrc.next(installation);
  }

  public getSelectedWowInstallation(): WowInstallation | undefined {
    return this._selectedWowInstallationSrc.value;
  }
}
