import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Component } from '@angular/core';
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
export class AppComponent { }
