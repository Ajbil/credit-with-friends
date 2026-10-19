import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { CreateCircleController } from './core/create-circle.controller';
import { CirclesCoreService } from './core/circles-core.service';
import { ListCirclesController } from './list/list-circles.controller';
import { ViewCircleController } from './view/view-circle.controller';
import { CircleInviteController } from './invite/circle-invite.controller';
import { JoinCircleController } from './join/join-circle.controller';
import { LeaveCircleController } from './leave/leave-circle.controller';
import { CircleRemovalsController } from './removals/circle-removals.controller';
import { CircleManageController } from './manage/circle-manage.controller';
import { lockMemberCircles } from './member-circles/lock-member-circles.service';

@Module({ imports: [ServiceBusModule], controllers: [CreateCircleController, ListCirclesController, ViewCircleController, CircleInviteController, JoinCircleController, LeaveCircleController, CircleRemovalsController, CircleManageController], providers: [CirclesCoreService] })
export class CirclesModule implements OnModuleInit {
  constructor(@Inject(ServiceBus) private readonly bus: ServiceBus) {}

  onModuleInit(): void {
    this.bus.registerRequest('circles.lockMemberCircles', ({ memberId, tx }) => lockMemberCircles(memberId, tx));
  }
}
