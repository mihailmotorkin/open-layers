import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Component } from '@angular/core';
import * as turf from '@turf/turf';
import { RouterOutlet } from '@angular/router';
import { HostModalComponent } from './сommon-ui/modal-feature/host-modal/host-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterOutlet,
    HostModalComponent,
    HostModalComponent,
  ],
  styleUrl: './app.component.css',
})
export class AppComponent {

  generatePointsByDistance(start: any, end: any, intervalMeters: any) {
    if (!intervalMeters) {
      return;
    }
    const line = turf.lineString([start, end]);
    const spoints = [turf.point(start), turf.point(end)];
    console.log(turf.bearing(spoints[0], spoints[1]));
    const totalDistance = turf.length(line, {units: 'centimetres'});
    console.log('дистанция в сантиметрах', totalDistance);
    const points = [];
    let currentDistance = 1000;

    while (currentDistance <= totalDistance) {
      const point = turf.along(line, currentDistance, {units: 'centimetres'});
      points.push(point.geometry.coordinates);
      currentDistance += intervalMeters;
    }

    return points;
  }
}
