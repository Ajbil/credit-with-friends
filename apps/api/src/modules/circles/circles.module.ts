import { Module } from '@nestjs/common';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { CreateCircleController } from './core/create-circle.controller';
import { CirclesCoreService } from './core/circles-core.service';
import { ListCirclesController } from './list/list-circles.controller';
import { ViewCircleController } from './view/view-circle.controller';
import { CircleInviteController } from './invite/circle-invite.controller';
import { JoinCircleController } from './join/join-circle.controller';
import { LeaveCircleController } from './leave/leave-circle.controller';
import { CircleRemovalsController } from './removals/circle-removals.controller';
import { CircleRemovalsService } from './removals/circle-removals.service';

@Module({ imports: [ServiceBusModule], controllers: [CreateCircleController, ListCirclesController, ViewCircleController, CircleInviteController, JoinCircleController, LeaveCircleController, CircleRemovalsController], providers: [CirclesCoreService, CircleRemovalsService] })
export class CirclesModule {}
