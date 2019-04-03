import { Component, OnInit } from '@angular/core';
import { CourseService } from 'src/app/services/course.service';
import { Observable } from 'rxjs';
import { Course } from 'src/app/models/course';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-course-list',
  templateUrl: './course-list.component.html',
  styles: []
})
export class CourseListComponent implements OnInit {
  public courses$: Observable<Course[]>;

  constructor(public auth: AuthService,
              private courseService: CourseService) {}

  ngOnInit() {
    this.courses$ = this.courseService.getAllCourses();
  }

  activeCourses(courses: Course[]): Course[] {
    return courses.filter(c => c.enabled);
  }

  relevantCourses(courses: Course[]): Course[] {
    return courses.filter(c => this.auth.user.courses.includes(c.slug));
  }
}