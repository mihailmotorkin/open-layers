import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { IMockFeatureCollection } from './mock-data';
import { delay, Observable, of } from 'rxjs';
import { GeoFeatureCollection } from '../interfaces/feature.interface';
import { MultiPolygon } from 'ol/geom';

@Injectable({
  providedIn: 'root',
})
export class WfsService {
  http = inject(HttpClient);

  private wfsUrl = 'https://billing-test.sevstar.net:15555/map/wfs';
  private loginUrl = 'https://billing-test.sevstar.net:15555/login.pl/login';

  login() {
    const body = new HttpParams()
      .set('login', 'system')
      .set('password', '0954564220');

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest'
    });

    return this.http.post(this.loginUrl, body.toString(), {
      headers,
      withCredentials: true
    });
  }

  getFeature() {
    const params = new HttpParams()
      .set('service', 'WFS')
      .set('version', '1.1')
      .set('request', 'GetFeature')
      .set('typename', 'ceres_test:farm')
      .set('srsname', 'EPSG:3857')
      .set('outputFormat', 'application/json')
      .set('bbox', '3739881.9268622925,5540871.484990796,3752341.1624727766,5551200.03843783,EPSG:3857');

    const headers = new HttpHeaders({
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'ru,en-US;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'X-Requested-With': 'XMLHttpRequest'
    });

    return this.http.get(this.wfsUrl, {
      headers,
      params,
      withCredentials: true
    });
  }

  getMockFeature(): Observable<GeoFeatureCollection<'MultiPolygon' | 'Point' | 'LineString'>> {
    return of(IMockFeatureCollection).pipe(delay(2500));
  }

}
