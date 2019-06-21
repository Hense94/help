import { Component, OnInit, Input } from '@angular/core';
import {AuthService} from '../../services/auth.service';
import { TrashCanService } from 'src/app/services/trash-can.service';
import { Observable } from 'rxjs';
import { TrashCan } from 'src/app/models/trash-can';
import { CommonService } from 'src/app/services/common.service';
import { Course } from 'src/app/models/course';
import {SessionService} from '../../services/session.service';

@Component({
  selector: 'app-ta',
  templateUrl: './ta.component.html',
  styleUrls: ['./ta.component.scss']
})
export class TaComponent implements OnInit {
  public course$: Observable<Course>;
  trashCans$: Observable<TrashCan[]>;

  constructor(public auth: AuthService,
              private session: SessionService,
              private garbageCollector: TrashCanService) {}

  ngOnInit() {
    this.course$ = this.session.getCourse$();
    console.log("subscribing to courses");
    this.course$.subscribe((course) => {
      console.log(course);
      this.trashCans$ = this.garbageCollector.getActiveByCourse(course);
    });
  }

  public deleteTrashCan(can: TrashCan) {
    this.garbageCollector.deleteTrashCan(can);
  }

  hasCreatedDate(trashCan: any): boolean {
    return CommonService.documentIsCreatedDatePresent(trashCan);
  }
}
