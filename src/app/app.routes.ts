import { Routes } from '@angular/router';
import { MapComponent } from './components/map/map.component';
import { RowsGeneratorComponent } from './components/rows-generator/rows-generator.component';
import { PointsGeneratorComponent } from './components/points-generator/points-generator.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'map',
    pathMatch: 'full',
  },
  { path: 'map', component: MapComponent },
  { path: 'rows-generator', component: RowsGeneratorComponent },
  { path: 'points-generator', component: PointsGeneratorComponent },
];
