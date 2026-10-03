import { Module } from '@nestjs/common';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { CreateCircleController } from './core/create-circle.controller';
import { CirclesCoreService } from './core/circles-core.service';
import { ListCirclesController } from './list/list-circles.controller';
import { ViewCircleController } from './view/view-circle.controller';
import { CircleInviteController } from './invite/circle-invite.controller';
import { JoinCircleController } from './join/join-circle.controller';

@Module({ imports: [ServiceBusModule], controllers: [CreateCircleController, ListCirclesController, ViewCircleController, CircleInviteController, JoinCircleController], providers: [CirclesCoreService] })
export class CirclesModule {}
