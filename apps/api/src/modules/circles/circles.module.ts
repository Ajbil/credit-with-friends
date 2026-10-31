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
import { lockSharedMembership } from './member-circles/lock-shared-membership.service';
import { lockCoMembers } from './member-circles/lock-co-members.service';
import { lockSharedCircles } from './member-circles/lock-shared-circles.service';

@Module({ imports: [ServiceBusModule], controllers: [CreateCircleController, ListCirclesController, ViewCircleController, CircleInviteController, JoinCircleController, LeaveCircleController, CircleRemovalsController, CircleManageController], providers: [CirclesCoreService] })
export class CirclesModule implements OnModuleInit {
  constructor(@Inject(ServiceBus) private readonly bus: ServiceBus) {}

  onModuleInit(): void {
    this.bus.registerRequest('circles.lockMemberCircles', ({ memberId, tx }) => lockMemberCircles(memberId, tx));
    this.bus.registerRequest('circles.lockCoMembers', ({ memberId, tx }) => lockCoMembers(memberId, tx));
    this.bus.registerRequest('circles.lockSharedCircles', ({ memberId, otherMemberId, tx }) => lockSharedCircles(memberId, otherMemberId, tx));
    this.bus.registerRequest('circles.lockSharedMembership', async ({ circleId, viewerId, memberId, tx }) => {
      if (!await lockSharedMembership(circleId, viewerId, memberId, tx)) return { shared: false };
      const names = await this.bus.request('accounts.displayNames', [memberId]);
      return names.length === 1 ? { shared: true, memberName: names[0].displayName } : { shared: false };
    });
  }
}
