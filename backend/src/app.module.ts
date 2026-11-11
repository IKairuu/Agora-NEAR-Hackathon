import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ChainModule } from './chain/chain.module.js';
import { IndexerModule } from './indexer/indexer.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { MandatesModule } from './mandates/mandates.module.js';
import { ReputationModule } from './reputation/reputation.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { BidsModule } from './bids/bids.module.js';
import { NegotiationsModule } from './negotiations/negotiations.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SpecsModule } from './specs/specs.module.js';
import { DeliveriesModule } from './deliveries/deliveries.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { DisputesModule } from './disputes/disputes.module.js';
import { SellersModule } from './sellers/sellers.module.js';
import { ServicesModule } from './services/services.module.js';
import { SavedModule } from './saved/saved.module.js';
import { SellerProfileModule } from './seller-profile/seller-profile.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { InternalModule } from './internal/internal.module.js';
import { DemoModule } from './demo/demo.module.js';

@Module({
    imports: [
        AuthModule,
        ChainModule,
        IndexerModule,
        WalletModule,
        MandatesModule,
        ReputationModule,
        AgentsModule,
        AccountsModule,
        RequestsModule,
        JobsModule,
        BidsModule,
        NegotiationsModule,
        MessagesModule,
        NotificationsModule,
        SpecsModule,
        DeliveriesModule,
        PaymentsModule,
        ReviewsModule,
        DisputesModule,
        SellersModule,
        ServicesModule,
        SavedModule,
        SellerProfileModule,
        OrdersModule,
        InternalModule,
        DemoModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
